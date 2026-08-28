from __future__ import annotations

import json
from pathlib import Path

import structlog
from fastapi.testclient import TestClient

from tagstudio.api.app import create_app
from tagstudio.observability.context import get_current_trace_id, trace_scope
from tagstudio.observability.logging import configure_logging, redact_sensitive_data
from tagstudio.observability.metrics import MetricsStore
from tagstudio.observability.paths import get_default_app_data_dir, get_telemetry_dirs


def test_telemetry_paths(tmp_path: Path):
    logs_dir, metrics_dir = get_telemetry_dirs(tmp_path)
    assert logs_dir.exists()
    assert metrics_dir.exists()
    assert logs_dir.parent.name == ".TagStudio"

    default_app_dir = get_default_app_data_dir()
    assert default_app_dir.exists()


def test_trace_scope():
    assert get_current_trace_id() is None
    with trace_scope("test-trace-123"):
        assert get_current_trace_id() == "test-trace-123"
    assert get_current_trace_id() is None


def test_redact_sensitive_data():
    event = {
        "event": "Request to http://127.0.0.1:5987/test?token=secret12345&other=1",
        "token": "secret12345",
        "api_token": "abcdef123456",
        "authorization": "Bearer secret-token",
        "safe_field": "visible_value",
    }
    redacted = redact_sensitive_data(None, "info", event)
    assert "[REDACTED]" in redacted["event"]
    assert "secret12345" not in redacted["event"]
    assert "[REDACTED]" in redacted["token"]
    assert "[REDACTED]" in redacted["api_token"]
    assert "[REDACTED]" in redacted["authorization"]
    assert redacted["safe_field"] == "visible_value"


def test_logging_configuration(tmp_path: Path):
    text_log, jsonl_log = configure_logging(library_dir=tmp_path)
    assert text_log.parent.exists()
    assert jsonl_log.parent.exists()

    logger = structlog.get_logger("test_logger")
    with trace_scope("trace-xyz"):
        logger.info("test.event", key="value_123")

    assert text_log.exists()
    assert jsonl_log.exists()

    lines = jsonl_log.read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) >= 1
    last_record = json.loads(lines[-1])
    assert last_record.get("event") == "test.event"
    assert last_record.get("key") == "value_123"
    assert last_record.get("trace_id") == "trace-xyz"


def test_metrics_store(tmp_path: Path):
    store = MetricsStore(library_dir=tmp_path)

    # 1. Record requests
    store.record_api_request(
        method="GET",
        route="/api/v1/health",
        status_code=200,
        duration_ms=5.4,
        trace_id="t1",
    )
    store.record_api_request(
        method="POST",
        route="/api/v1/search",
        status_code=200,
        duration_ms=45.2,
        trace_id="t2",
    )
    store.record_api_request(
        method="GET",
        route="/api/v1/entries/9999",
        status_code=404,
        duration_ms=2.1,
        trace_id="t3",
        error_message="Entry not found.",
    )

    # 2. Record operations
    store.record_operation(
        category="thumbnail",
        operation_name="cache_hit",
        duration_ms=1.2,
        trace_id="t4",
    )
    store.record_operation(
        category="thumbnail",
        operation_name="generate",
        duration_ms=85.0,
        trace_id="t5",
        metadata={"size": 256},
    )
    store.record_operation(
        category="db_query",
        operation_name="search_library",
        duration_ms=120.5,
        trace_id="t2",
    )

    # 3. Record error
    store.record_error(
        source="backend_test",
        error_type="ValueError",
        message="Simulated error",
        stack_trace="Traceback (most recent call last): ...",
        trace_id="t3",
    )

    # 4. Assert summary calculations
    summary = store.get_summary(window_seconds=3600)
    assert summary["api"]["total_requests"] == 3
    assert summary["api"]["error_requests"] == 1
    assert summary["api"]["latency_ms"]["avg"] > 0
    assert summary["thumbnails"]["total_requests"] == 2
    assert summary["thumbnails"]["cache_hits"] == 1
    assert summary["thumbnails"]["cache_misses"] == 1
    assert summary["thumbnails"]["hit_ratio_pct"] == 50.0
    assert len(summary["slow_operations"]) >= 2  # >= 50ms (generate: 85ms, search_library: 120.5ms)

    # 5. Assert recent errors
    errors = store.get_recent_errors(limit=10)
    assert len(errors) == 1
    assert errors[0]["error_type"] == "ValueError"
    assert errors[0]["message"] == "Simulated error"
    assert errors[0]["trace_id"] == "t3"

    # 6. Test retention pruning
    store.prune_old_records(retention_days=0)


def test_api_observability_middleware_and_telemetry_routes():
    app = create_app(require_token=False)
    client = TestClient(app)

    # Make request with custom trace id
    response = client.get("/api/v1/health", headers={"x-trace-id": "custom-trace-abc"})
    assert response.status_code == 200
    assert response.headers.get("X-Trace-Id") == "custom-trace-abc"
    assert "X-Response-Time-Ms" in response.headers

    # Ingest frontend events
    telemetry_payload = {
        "events": [
            {
                "kind": "error",
                "name": "ComponentCrash",
                "error_type": "TypeError",
                "message": "Cannot read properties of undefined",
                "stack_trace": "Error: at Component.render",
                "trace_id": "fe-trace-1",
            },
            {
                "kind": "timing",
                "name": "search_render",
                "duration_ms": 32.5,
                "trace_id": "fe-trace-1",
                "metadata": {"results_count": 20},
            },
            {
                "kind": "breadcrumb",
                "name": "user_clicked_tag",
                "trace_id": "fe-trace-1",
                "metadata": {"tag_name": "landscape"},
            },
        ]
    }
    ingest_res = client.post("/api/v1/telemetry/events", json=telemetry_payload)
    assert ingest_res.status_code == 200
    assert ingest_res.json()["ingested"] == 3

    # Query summary
    summary_res = client.get("/api/v1/telemetry/summary")
    assert summary_res.status_code == 200
    summary_data = summary_res.json()
    assert "api" in summary_data
    assert "thumbnails" in summary_data
    assert "slow_operations" in summary_data

    # Query errors
    errors_res = client.get("/api/v1/telemetry/errors")
    assert errors_res.status_code == 200
    errors_data = errors_res.json()
    assert len(errors_data) >= 1
    assert any(e["error_type"] == "TypeError" for e in errors_data)

    # Query logs
    logs_res = client.get("/api/v1/telemetry/logs?limit=50")
    assert logs_res.status_code == 200
    assert isinstance(logs_res.json(), list)

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from tagstudio.api.state import ApiState
from tagstudio.observability.metrics import get_metrics_store
from tagstudio.observability.paths import get_telemetry_dirs


class TelemetryEventItem(BaseModel):
    kind: str = Field(..., description="Kind of telemetry event: 'error', 'timing', 'breadcrumb'")
    trace_id: str | None = None
    name: str
    duration_ms: float | None = None
    error_type: str | None = None
    message: str | None = None
    stack_trace: str | None = None
    metadata: dict[str, Any] | None = None


class TelemetryEventsBatch(BaseModel):
    events: list[TelemetryEventItem]


def create_telemetry_router(*, state: ApiState) -> APIRouter:
    router = APIRouter(prefix="/api/v1/telemetry", tags=["telemetry"])

    @router.get("/summary")
    def get_summary(
        window_seconds: int = Query(default=3600, ge=60, le=86400 * 30),
    ) -> dict[str, Any]:
        """Return aggregated latency percentiles, slow queries, and cache stats."""
        lib = state.get_library()
        lib_dir = lib.library_dir if lib else None
        store = get_metrics_store(library_dir=lib_dir)
        return store.get_summary(window_seconds=window_seconds)

    @router.get("/errors")
    def get_errors(limit: int = Query(default=50, ge=1, le=200)) -> list[dict[str, Any]]:
        """Return recent error records across backend and frontend."""
        lib = state.get_library()
        lib_dir = lib.library_dir if lib else None
        store = get_metrics_store(library_dir=lib_dir)
        return store.get_recent_errors(limit=limit)

    @router.get("/logs")
    def get_logs(
        limit: int = Query(default=100, ge=1, le=500),
        level: str | None = None,
        query: str | None = None,
    ) -> list[dict[str, Any]]:
        """Return recent log lines parsed from the local JSONL log file."""
        lib = state.get_library()
        lib_dir = lib.library_dir if lib else None
        logs_dir, _ = get_telemetry_dirs(lib_dir)
        jsonl_path = logs_dir / "tagstudio.jsonl"

        if not jsonl_path.exists():
            return []

        results: list[dict[str, Any]] = []
        target_level = level.lower().strip() if level else None
        target_query = query.lower().strip() if query else None

        try:
            with jsonl_path.open("r", encoding="utf-8", errors="replace") as f:
                lines = f.readlines()

            for raw_line in reversed(lines):
                line = raw_line.strip()
                if not line:
                    continue
                try:
                    parsed = json.loads(line)
                except Exception:
                    continue

                if target_level and str(parsed.get("level", "")).lower() != target_level:
                    continue

                if target_query:
                    searchable = json.dumps(parsed).lower()
                    if target_query not in searchable:
                        continue

                results.append(parsed)
                if len(results) >= limit:
                    break
        except Exception:
            return []

        return results

    @router.post("/events")
    def record_events(batch: TelemetryEventsBatch) -> dict[str, Any]:
        """Ingest batched frontend telemetry events (errors, interaction timings, breadcrumbs)."""
        lib = state.get_library()
        lib_dir = lib.library_dir if lib else None
        store = get_metrics_store(library_dir=lib_dir)

        ingested = 0
        for event in batch.events:
            if event.kind == "error":
                store.record_error(
                    source="frontend",
                    error_type=event.error_type or "ClientError",
                    message=event.message or event.name,
                    stack_trace=event.stack_trace,
                    trace_id=event.trace_id,
                    context=event.metadata,
                )
                ingested += 1
            elif event.kind == "timing" and event.duration_ms is not None:
                store.record_operation(
                    category="frontend_timing",
                    operation_name=event.name,
                    duration_ms=event.duration_ms,
                    trace_id=event.trace_id,
                    metadata=event.metadata,
                )
                ingested += 1
            elif event.kind == "breadcrumb":
                store.record_operation(
                    category="frontend_breadcrumb",
                    operation_name=event.name,
                    duration_ms=0.0,
                    trace_id=event.trace_id,
                    metadata=event.metadata,
                )
                ingested += 1

        return {"success": True, "ingested": ingested}

    return router

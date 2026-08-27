from __future__ import annotations

import json
import sqlite3
import threading
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from tagstudio.observability.context import get_current_trace_id
from tagstudio.observability.paths import get_telemetry_dirs


class MetricsStore:
    """Thread-safe SQLite-backed store for local metrics, operational timers, and error events."""

    def __init__(self, library_dir: Path | None = None) -> None:
        _, metrics_dir = get_telemetry_dirs(library_dir)
        self.db_path = metrics_dir / "observability.db"
        self._lock = threading.Lock()
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path), check_same_thread=False, timeout=10.0)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
        conn.execute("PRAGMA busy_timeout=5000;")
        return conn

    def _init_db(self) -> None:
        with self._lock, self._get_connection() as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS api_requests (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    trace_id TEXT,
                    method TEXT NOT NULL,
                    route TEXT NOT NULL,
                    status_code INTEGER NOT NULL,
                    duration_ms REAL NOT NULL,
                    error_message TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_api_requests_ts ON api_requests(timestamp);
                CREATE INDEX IF NOT EXISTS idx_api_requests_route ON api_requests(route);
                CREATE INDEX IF NOT EXISTS idx_api_requests_status ON api_requests(status_code);
                CREATE INDEX IF NOT EXISTS idx_api_requests_trace ON api_requests(trace_id);

                CREATE TABLE IF NOT EXISTS operation_timers (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    trace_id TEXT,
                    category TEXT NOT NULL,
                    operation_name TEXT NOT NULL,
                    duration_ms REAL NOT NULL,
                    metadata_json TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_op_timers_ts ON operation_timers(timestamp);
                CREATE INDEX IF NOT EXISTS idx_op_timers_category ON operation_timers(category);
                CREATE INDEX IF NOT EXISTS idx_op_timers_op ON operation_timers(operation_name);
                CREATE INDEX IF NOT EXISTS idx_op_timers_trace ON operation_timers(trace_id);

                CREATE TABLE IF NOT EXISTS error_records (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    trace_id TEXT,
                    source TEXT NOT NULL,
                    error_type TEXT NOT NULL,
                    message TEXT NOT NULL,
                    stack_trace TEXT,
                    context_json TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_error_records_ts ON error_records(timestamp);
                CREATE INDEX IF NOT EXISTS idx_error_records_source ON error_records(source);
                CREATE INDEX IF NOT EXISTS idx_error_records_trace ON error_records(trace_id);
            """)

    def record_api_request(
        self,
        *,
        method: str,
        route: str,
        status_code: int,
        duration_ms: float,
        trace_id: str | None = None,
        error_message: str | None = None,
    ) -> None:
        timestamp = datetime.now(UTC).isoformat()
        effective_trace_id = trace_id or get_current_trace_id()
        with self._lock, self._get_connection() as conn:
            conn.execute(
                """
                INSERT INTO api_requests (timestamp, trace_id, method, route, status_code, duration_ms, error_message)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (timestamp, effective_trace_id, method, route, status_code, duration_ms, error_message),
            )

    def record_operation(
        self,
        *,
        category: str,
        operation_name: str,
        duration_ms: float,
        trace_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        timestamp = datetime.now(UTC).isoformat()
        effective_trace_id = trace_id or get_current_trace_id()
        meta_json = json.dumps(metadata, ensure_ascii=False) if metadata else None
        with self._lock, self._get_connection() as conn:
            conn.execute(
                """
                INSERT INTO operation_timers (timestamp, trace_id, category, operation_name, duration_ms, metadata_json)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (timestamp, effective_trace_id, category, operation_name, duration_ms, meta_json),
            )

    def record_error(
        self,
        *,
        source: str,
        error_type: str,
        message: str,
        stack_trace: str | None = None,
        trace_id: str | None = None,
        context: dict[str, Any] | None = None,
    ) -> None:
        timestamp = datetime.now(UTC).isoformat()
        effective_trace_id = trace_id or get_current_trace_id()
        ctx_json = json.dumps(context, ensure_ascii=False) if context else None
        with self._lock, self._get_connection() as conn:
            conn.execute(
                """
                INSERT INTO error_records (timestamp, trace_id, source, error_type, message, stack_trace, context_json)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (timestamp, effective_trace_id, source, error_type, message, stack_trace, ctx_json),
            )

    def get_summary(self, window_seconds: int = 3600) -> dict[str, Any]:
        """Compute aggregated latency percentiles, error rates, and slow operations."""
        cutoff = (datetime.now(UTC) - timedelta(seconds=window_seconds)).isoformat()
        with self._lock, self._get_connection() as conn:
            # 1. API request latency percentiles & status distribution
            req_rows = conn.execute(
                """
                SELECT duration_ms, status_code, route
                FROM api_requests
                WHERE timestamp >= ?
                ORDER BY duration_ms ASC
                """,
                (cutoff,),
            ).fetchall()

            total_requests = len(req_rows)
            error_requests = sum(1 for r in req_rows if r["status_code"] >= 400)

            durations = [r["duration_ms"] for r in req_rows]
            p50 = durations[int(len(durations) * 0.50)] if durations else 0.0
            p95 = durations[int(len(durations) * 0.95)] if durations else 0.0
            p99 = durations[int(len(durations) * 0.99)] if durations else 0.0
            max_latency = durations[-1] if durations else 0.0
            avg_latency = round(sum(durations) / len(durations), 2) if durations else 0.0

            # Route breakdown
            route_stats: dict[str, dict[str, Any]] = {}
            for r in req_rows:
                route = r["route"]
                if route not in route_stats:
                    route_stats[route] = {"count": 0, "errors": 0, "durations": []}
                route_stats[route]["count"] += 1
                if r["status_code"] >= 400:
                    route_stats[route]["errors"] += 1
                route_stats[route]["durations"].append(r["duration_ms"])

            route_summary = []
            for route, stat in route_stats.items():
                durs = sorted(stat["durations"])
                route_summary.append({
                    "route": route,
                    "count": stat["count"],
                    "errors": stat["errors"],
                    "avg_ms": round(sum(durs) / len(durs), 2),
                    "p95_ms": round(durs[int(len(durs) * 0.95)], 2) if durs else 0.0,
                })
            route_summary.sort(key=lambda x: x["count"], reverse=True)

            # 2. Total error records count
            error_count = conn.execute(
                "SELECT COUNT(*) as cnt FROM error_records WHERE timestamp >= ?",
                (cutoff,),
            ).fetchone()["cnt"]

            # 3. Slow operations (>50ms)
            slow_ops = conn.execute(
                """
                SELECT category, operation_name, duration_ms, timestamp, trace_id, metadata_json
                FROM operation_timers
                WHERE timestamp >= ? AND duration_ms >= 50.0
                ORDER BY duration_ms DESC
                LIMIT 20
                """,
                (cutoff,),
            ).fetchall()

            # 4. Thumbnail operations summary
            thumb_ops = conn.execute(
                """
                SELECT operation_name, duration_ms, metadata_json
                FROM operation_timers
                WHERE timestamp >= ? AND category = 'thumbnail'
                """,
                (cutoff,),
            ).fetchall()

            thumb_hits = 0
            thumb_misses = 0
            thumb_durations = []
            for t in thumb_ops:
                if t["operation_name"] == "cache_hit":
                    thumb_hits += 1
                elif t["operation_name"] == "generate":
                    thumb_misses += 1
                    thumb_durations.append(t["duration_ms"])

            total_thumb = thumb_hits + thumb_misses
            hit_ratio = round((thumb_hits / total_thumb) * 100, 1) if total_thumb > 0 else 100.0

            return {
                "window_seconds": window_seconds,
                "api": {
                    "total_requests": total_requests,
                    "error_requests": error_requests,
                    "error_rate_pct": round((error_requests / total_requests) * 100, 2) if total_requests > 0 else 0.0,
                    "latency_ms": {
                        "avg": avg_latency,
                        "p50": round(p50, 2),
                        "p95": round(p95, 2),
                        "p99": round(p99, 2),
                        "max": round(max_latency, 2),
                    },
                    "routes": route_summary[:15],
                },
                "errors_total": error_count,
                "thumbnails": {
                    "total_requests": total_thumb,
                    "cache_hits": thumb_hits,
                    "cache_misses": thumb_misses,
                    "hit_ratio_pct": hit_ratio,
                    "avg_generate_ms": round(sum(thumb_durations) / len(thumb_durations), 2) if thumb_durations else 0.0,
                },
                "slow_operations": [
                    {
                        "category": r["category"],
                        "operation": r["operation_name"],
                        "duration_ms": round(r["duration_ms"], 2),
                        "timestamp": r["timestamp"],
                        "trace_id": r["trace_id"],
                        "metadata": json.loads(r["metadata_json"]) if r["metadata_json"] else None,
                    }
                    for r in slow_ops
                ],
            }

    def get_recent_errors(self, limit: int = 50) -> list[dict[str, Any]]:
        with self._lock, self._get_connection() as conn:
            rows = conn.execute(
                """
                SELECT id, timestamp, trace_id, source, error_type, message, stack_trace, context_json
                FROM error_records
                ORDER BY id DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()

            return [
                {
                    "id": r["id"],
                    "timestamp": r["timestamp"],
                    "trace_id": r["trace_id"],
                    "source": r["source"],
                    "error_type": r["error_type"],
                    "message": r["message"],
                    "stack_trace": r["stack_trace"],
                    "context": json.loads(r["context_json"]) if r["context_json"] else None,
                }
                for r in rows
            ]

    def prune_old_records(self, retention_days: int = 30) -> None:
        cutoff = (datetime.now(UTC) - timedelta(days=retention_days)).isoformat()
        with self._lock, self._get_connection() as conn:
            conn.execute("DELETE FROM api_requests WHERE timestamp < ?", (cutoff,))
            conn.execute("DELETE FROM operation_timers WHERE timestamp < ?", (cutoff,))
            conn.execute("DELETE FROM error_records WHERE timestamp < ?", (cutoff,))


# Global singleton instance (lazily initialized or bound to active library)
_global_metrics_store: MetricsStore | None = None
_store_lock = threading.Lock()


def get_metrics_store(library_dir: Path | None = None) -> MetricsStore:
    global _global_metrics_store
    with _store_lock:
        if _global_metrics_store is None or (_global_metrics_store and library_dir is not None):
            _global_metrics_store = MetricsStore(library_dir=library_dir)
        return _global_metrics_store

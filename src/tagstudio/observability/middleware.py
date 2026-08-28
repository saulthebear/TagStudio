from __future__ import annotations

import time
import traceback
from uuid import uuid4

import structlog
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from tagstudio.observability.context import set_current_trace_id, trace_id_var
from tagstudio.observability.metrics import get_metrics_store

logger = structlog.get_logger(__name__)


class ObservabilityMiddleware(BaseHTTPMiddleware):
    """FastAPI/Starlette middleware that captures trace IDs, request latencies, and errors."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        trace_id = request.headers.get("x-trace-id") or uuid4().hex
        token = set_current_trace_id(trace_id)

        start_time = time.perf_counter()
        route = request.url.path
        method = request.method
        error_message: str | None = None

        try:
            response = await call_next(request)
            status_code = response.status_code
        except Exception as exc:
            status_code = 500
            error_message = str(exc)
            stack_trace = traceback.format_exc()

            store = get_metrics_store()
            store.record_error(
                source="backend_api",
                error_type=type(exc).__name__,
                message=error_message,
                stack_trace=stack_trace,
                trace_id=trace_id,
                context={"route": route, "method": method},
            )

            logger.error(
                "api.request.unhandled_exception",
                route=route,
                method=method,
                error=error_message,
                trace_id=trace_id,
                exc_info=True,
            )
            raise
        finally:
            duration_ms = round((time.perf_counter() - start_time) * 1000, 2)

            # Record in SQLite metrics store
            try:
                store = get_metrics_store()
                store.record_api_request(
                    method=method,
                    route=route,
                    status_code=status_code,
                    duration_ms=duration_ms,
                    trace_id=trace_id,
                    error_message=error_message,
                )
            except Exception as store_err:
                logger.debug("Failed to record api metric", error=str(store_err))
            finally:
                trace_id_var.reset(token)

        response.headers["X-Trace-Id"] = trace_id
        response.headers["X-Response-Time-Ms"] = f"{duration_ms:.2f}"

        if status_code >= 500:
            logger.error(
                "api.request.failed",
                route=route,
                method=method,
                status=status_code,
                duration_ms=duration_ms,
                trace_id=trace_id,
            )
        elif status_code >= 400:
            logger.warning(
                "api.request.client_error",
                route=route,
                method=method,
                status=status_code,
                duration_ms=duration_ms,
                trace_id=trace_id,
            )
        else:
            logger.info(
                "api.request.success",
                route=route,
                method=method,
                status=status_code,
                duration_ms=duration_ms,
                trace_id=trace_id,
            )

        return response

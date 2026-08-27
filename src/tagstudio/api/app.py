import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from tagstudio.api.auth import TokenAuthMiddleware
from tagstudio.api.jobs import JobManager
from tagstudio.api.routes import create_router
from tagstudio.api.state import ApiState
from tagstudio.api.telemetry_routes import create_telemetry_router
from tagstudio.observability.logging import configure_logging
from tagstudio.observability.metrics import get_metrics_store
from tagstudio.observability.middleware import ObservabilityMiddleware


def _env_flag(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _allowed_origins() -> list[str]:
    raw = os.getenv("TAGSTUDIO_API_ALLOWED_ORIGINS")
    if raw:
        parsed = [origin.strip() for origin in raw.split(",") if origin.strip()]
        if parsed:
            return parsed
    return [
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        "http://127.0.0.1:4173",
        "http://localhost:4173",
    ]


def create_app(
    *,
    api_token: str | None = None,
    require_token: bool = True,
    allow_query_token: bool | None = None,
) -> FastAPI:
    configure_logging()
    get_metrics_store()

    state = ApiState(token=api_token)
    jobs = JobManager()

    app = FastAPI(
        title="TagStudio API",
        description="Local API for TagStudio web frontend.",
        version="0.1.0",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_allowed_origins(),
        allow_methods=["*"],
        allow_headers=["*"],
    )

    effective_allow_query_token = (
        _env_flag("TAGSTUDIO_API_ALLOW_QUERY_TOKEN", default=False)
        if allow_query_token is None
        else allow_query_token
    )
    app.add_middleware(
        TokenAuthMiddleware,
        token=api_token,
        require_token=require_token,
        allow_query_token=effective_allow_query_token,
    )
    app.add_middleware(ObservabilityMiddleware)

    app.include_router(create_router(state=state, jobs=jobs))
    app.include_router(create_telemetry_router(state=state))

    @app.on_event("shutdown")
    def close_library_on_shutdown() -> None:
        state.close_library()

    app.state.tagstudio = state
    app.state.jobs = jobs
    return app


from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from tagstudio.api.auth import TokenAuthMiddleware
from tagstudio.api.jobs import JobManager
from tagstudio.api.routes import create_router
from tagstudio.api.state import ApiState


def create_app(*, api_token: str | None = None) -> FastAPI:
    state = ApiState(token=api_token)
    jobs = JobManager()

    app = FastAPI(
        title="TagStudio API",
        description="Local API for TagStudio web frontend.",
        version="0.1.0",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    if api_token:
        app.add_middleware(TokenAuthMiddleware, token=api_token)

    app.include_router(create_router(state=state, jobs=jobs))

    @app.on_event("shutdown")
    def close_library_on_shutdown() -> None:
        state.close_library()

    app.state.tagstudio = state
    app.state.jobs = jobs
    return app

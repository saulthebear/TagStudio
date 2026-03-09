import secrets

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response


class TokenAuthMiddleware(BaseHTTPMiddleware):
    """Simple token auth for local API usage."""

    def __init__(
        self,
        app,
        token: str | None,
        *,
        require_token: bool = True,
        allow_query_token: bool = True,
    ):
        super().__init__(app)
        self.token = token
        self.require_token = require_token
        self.allow_query_token = allow_query_token

    async def dispatch(self, request: Request, call_next) -> Response:
        if not self.require_token:
            return await call_next(request)

        # Allow basic liveness without a token.
        if request.url.path == "/api/v1/health":
            return await call_next(request)

        # CORS preflight does not include auth headers and should pass through.
        if request.method == "OPTIONS" and request.headers.get("access-control-request-method"):
            return await call_next(request)

        if not self.token:
            return JSONResponse(
                status_code=503,
                content={"detail": "API token is required but not configured."},
            )

        provided = request.headers.get("x-tagstudio-token")
        if provided is None and self.allow_query_token:
            provided = request.query_params.get("token")
        if provided is None or not secrets.compare_digest(provided, self.token):
            return JSONResponse(
                status_code=401,
                content={"detail": "Unauthorized"},
            )
        return await call_next(request)

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response


class TokenAuthMiddleware(BaseHTTPMiddleware):
    """Simple token auth for local API usage."""

    def __init__(self, app, token: str):
        super().__init__(app)
        self.token = token

    async def dispatch(self, request: Request, call_next) -> Response:
        if not self.token:
            return await call_next(request)

        # Allow basic liveness without a token.
        if request.url.path == "/api/v1/health":
            return await call_next(request)

        provided = request.headers.get("x-tagstudio-token")
        if provided is None:
            provided = request.query_params.get("token")
        if provided != self.token:
            return JSONResponse(
                status_code=401,
                content={"detail": "Unauthorized"},
            )
        return await call_next(request)

import argparse
import os
import secrets
import sys

import uvicorn

from tagstudio.api.app import create_app


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the TagStudio local API server.")
    parser.add_argument("--host", default="127.0.0.1", help="Bind host.")
    parser.add_argument("--port", type=int, default=5987, help="Bind port.")
    parser.add_argument(
        "--token",
        default=os.getenv("TAGSTUDIO_API_TOKEN"),
        help="Optional API token required in `x-tagstudio-token` header.",
    )
    parser.add_argument(
        "--require-token",
        action=argparse.BooleanOptionalAction,
        default=False,
        help="Require token auth for all non-health routes (disabled by default for local dev).",
    )
    parser.add_argument(
        "--allow-query-token",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Allow `?token=` fallback for clients that cannot send auth headers.",
    )
    args = parser.parse_args()

    token = args.token
    if args.require_token and not token:
        token = secrets.token_urlsafe(24)
        sys.stderr.write(
            "Generated TAGSTUDIO_API_TOKEN for this run. "
            "Set VITE_TAGSTUDIO_API_TOKEN to connect web clients: "
            f"{token}\n"
        )

    app = create_app(
        api_token=token,
        require_token=args.require_token,
        allow_query_token=args.allow_query_token,
    )
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()

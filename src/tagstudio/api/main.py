import argparse
import os

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
    args = parser.parse_args()

    app = create_app(api_token=args.token)
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()

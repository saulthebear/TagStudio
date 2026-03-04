import argparse
import json
from pathlib import Path

from tagstudio.api.app import create_app


def export_openapi(output_path: Path) -> None:
    app = create_app()
    schema = app.openapi()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(schema, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Export TagStudio API OpenAPI schema.")
    parser.add_argument(
        "--output",
        default="packages/api-client/openapi/tagstudio-api.json",
        help="Path to output OpenAPI schema JSON.",
    )
    args = parser.parse_args()
    export_openapi(Path(args.output))


if __name__ == "__main__":
    main()

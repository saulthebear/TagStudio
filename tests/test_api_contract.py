import json
from pathlib import Path

from tagstudio.api.app import create_app


def test_openapi_schema_matches_committed_contract(cwd: Path):
    schema_path = cwd.parent / "packages" / "api-client" / "openapi" / "tagstudio-api.json"
    assert schema_path.exists(), f"Missing OpenAPI contract file: {schema_path}"

    with open(schema_path, encoding="utf-8") as f:
        contract_schema = json.load(f)

    runtime_schema = create_app(require_token=False).openapi()

    assert contract_schema == runtime_schema, (
        "The committed OpenAPI contract is stale. Run `bun run generate:openapi` "
        "and commit the result."
    )

import json
from pathlib import Path

from tagstudio.api.app import create_app


def test_openapi_paths_match_generated_client_contract(cwd: Path):
    schema_path = cwd.parent / "packages" / "api-client" / "openapi" / "tagstudio-api.json"
    assert schema_path.exists(), f"Missing OpenAPI contract file: {schema_path}"

    with open(schema_path, encoding="utf-8") as f:
        contract_schema = json.load(f)

    runtime_schema = create_app().openapi()

    contract_paths = set(contract_schema["paths"].keys())
    runtime_paths = set(runtime_schema["paths"].keys())
    assert contract_paths == runtime_paths

    for path in contract_paths:
        assert set(contract_schema["paths"][path].keys()) == set(
            runtime_schema["paths"][path].keys()
        )

from __future__ import annotations

import json
from pathlib import Path
from tempfile import TemporaryDirectory

from fastapi.testclient import TestClient

from tagstudio.api.app import create_app
from tagstudio.core.library.alchemy.library import Library
from tagstudio.core.library.alchemy.models import Entry, Tag
from tagstudio.core.utils.types import unwrap


def seed_library(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)
    (path / "foo.txt").write_text("hello", encoding="utf-8")

    lib = Library()
    status = lib.open_library(path)
    assert status.success

    tag = unwrap(
        lib.add_tag(Tag(name="foo", color_namespace="tagstudio-standard", color_slug="red"))
    )
    folder = unwrap(lib.folder)
    entry = Entry(path=Path("foo.txt"), folder=folder, fields=lib.default_fields)
    assert lib.add_entries([entry])
    assert lib.add_tags_to_entries(entry.id, tag.id)
    lib.close()


def test_api_core_workflows() -> None:
    with TemporaryDirectory() as tmp:
        library_path = Path(tmp)
        seed_library(library_path)

        app = create_app()
        with TestClient(app) as client:
            res = client.get("/api/v1/health")
            assert res.status_code == 200
            assert res.json()["status"] == "ok"

            state = client.get("/api/v1/libraries/state")
            assert state.status_code == 200
            assert state.json()["is_open"] is False

            open_res = client.post("/api/v1/libraries/open", json={"path": str(library_path)})
            assert open_res.status_code == 200
            assert open_res.json()["is_open"] is True

            search = client.post("/api/v1/search", json={"query": ""})
            assert search.status_code == 200
            payload = search.json()
            assert payload["total_count"] >= 1
            entry_id = payload["ids"][0]

            entry = client.get(f"/api/v1/entries/{entry_id}")
            assert entry.status_code == 200

            update = client.patch(
                f"/api/v1/entries/{entry_id}/fields/TITLE",
                json={"value": "updated title"},
            )
            assert update.status_code == 200
            assert any(
                field["type_key"] == "TITLE" and field["value"] == "updated title"
                for field in update.json()["fields"]
            )

            new_tag = client.post(
                "/api/v1/tags",
                json={
                    "name": "api-created-tag",
                    "color_namespace": "tagstudio-standard",
                    "color_slug": "blue",
                },
            )
            assert new_tag.status_code == 200
            new_tag_id = new_tag.json()["id"]

            add_tags = client.post(
                "/api/v1/entries/tags:add",
                json={"entry_ids": [entry_id], "tag_ids": [new_tag_id]},
            )
            assert add_tags.status_code == 200
            assert add_tags.json()["success"] is True

            remove_tags = client.post(
                "/api/v1/entries/tags:remove",
                json={"entry_ids": [entry_id], "tag_ids": [new_tag_id]},
            )
            assert remove_tags.status_code == 200
            assert remove_tags.json()["success"] is True

            delete_tag = client.delete(f"/api/v1/tags/{new_tag_id}")
            assert delete_tag.status_code == 200
            assert delete_tag.json()["success"] is True


def test_refresh_job_sse() -> None:
    with TemporaryDirectory() as tmp:
        library_path = Path(tmp)
        seed_library(library_path)

        app = create_app()
        with TestClient(app) as client:
            open_res = client.post("/api/v1/libraries/open", json={"path": str(library_path)})
            assert open_res.status_code == 200

            (library_path / "added.txt").write_text("new", encoding="utf-8")

            start_job = client.post("/api/v1/jobs/refresh")
            assert start_job.status_code == 200
            job_id = start_job.json()["job_id"]

            statuses: list[str] = []
            with client.stream("GET", f"/api/v1/jobs/{job_id}/events") as stream:
                event_name = ""
                for line in stream.iter_lines():
                    if not line:
                        continue
                    if line.startswith("event:"):
                        event_name = line.split(":", 1)[1].strip()
                        continue
                    if line.startswith("data:"):
                        payload = json.loads(line.split(":", 1)[1].strip())
                        statuses.append(payload["status"])
                        if event_name in {"job.completed", "job.failed"}:
                            break

            assert "running" in statuses
            assert "completed" in statuses

            state = client.get(f"/api/v1/jobs/{job_id}")
            assert state.status_code == 200
            assert state.json()["status"] == "completed"

            search = client.post("/api/v1/search", json={"query": 'path:"added.txt"'})
            assert search.status_code == 200
            assert search.json()["total_count"] == 1

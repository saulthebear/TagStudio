from __future__ import annotations

import base64
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from fastapi.testclient import TestClient
from PIL import Image

from tagstudio.api.app import create_app
from tagstudio.core.library.alchemy.library import Library
from tagstudio.core.library.alchemy.models import Entry, Tag
from tagstudio.core.media.thumbnail_pipeline import ThumbnailPipeline, ThumbnailUnsupportedError
from tagstudio.core.utils.types import unwrap

TINY_PNG_BASE64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Y0XcAAAAASUVORK5CYII="
)


def seed_library(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)
    (path / "foo.txt").write_text("hello", encoding="utf-8")
    (path / "thumb.png").write_bytes(base64.b64decode(TINY_PNG_BASE64))
    (path / "broken.webm").write_bytes(b"not a real video file")

    lib = Library()
    status = lib.open_library(path)
    assert status.success

    tag = unwrap(
        lib.add_tag(Tag(name="foo", color_namespace="tagstudio-standard", color_slug="red"))
    )
    folder = unwrap(lib.folder)
    entries = [
        Entry(path=Path("foo.txt"), folder=folder, fields=lib.default_fields),
        Entry(path=Path("thumb.png"), folder=folder, fields=lib.default_fields),
        Entry(path=Path("broken.webm"), folder=folder, fields=lib.default_fields),
    ]
    assert lib.add_entries(entries)
    assert lib.add_tags_to_entries(entries[0].id, tag.id)
    lib.close()


def get_entry_ids_by_filename(client: TestClient) -> dict[str, int]:
    search = client.post("/api/v1/search", json={"query": ""})
    assert search.status_code == 200
    return {item["filename"]: item["id"] for item in search.json()["entries"]}


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

            field_types = client.get("/api/v1/field-types")
            assert field_types.status_code == 200
            assert any(field["key"] == "TITLE" for field in field_types.json())

            tags = client.get("/api/v1/tags")
            assert tags.status_code == 200
            assert any(tag["name"] == "foo" for tag in tags.json())

            colors = client.get("/api/v1/tag-colors")
            assert colors.status_code == 200
            assert any(group["namespace"] == "tagstudio-standard" for group in colors.json())

            settings = client.get("/api/v1/settings")
            assert settings.status_code == 200
            assert settings.json()["page_size"] == 200
            assert settings.json()["layout"]["main_split_ratio"] == 0.78
            assert settings.json()["layout"]["mobile_active_pane"] == "grid"
            assert settings.json()["thumbnails"]["grid_size"] >= 32

            updated_settings = client.patch(
                "/api/v1/settings",
                json={
                    "page_size": 100,
                    "sorting_mode": "file.path",
                    "ascending": False,
                    "layout": {
                        "main_split_ratio": 0.66,
                        "mobile_active_pane": "metadata",
                    },
                    "thumbnails": {
                        "cache_max_mib": 600,
                        "grid_size": 224,
                        "preview_size": 720,
                        "quality": 78,
                    },
                },
            )
            assert updated_settings.status_code == 200
            assert updated_settings.json()["page_size"] == 100
            assert updated_settings.json()["sorting_mode"] == "file.path"
            assert updated_settings.json()["ascending"] is False
            assert updated_settings.json()["layout"]["main_split_ratio"] == 0.66
            assert updated_settings.json()["layout"]["mobile_active_pane"] == "metadata"
            assert updated_settings.json()["thumbnails"]["grid_size"] == 224
            assert updated_settings.json()["thumbnails"]["preview_size"] == 720

            partial_layout_update = client.patch(
                "/api/v1/settings",
                json={"layout": {"preview_collapsed": True}},
            )
            assert partial_layout_update.status_code == 200
            assert partial_layout_update.json()["layout"]["preview_collapsed"] is True
            # Ensure deep merge keeps sibling layout keys.
            assert partial_layout_update.json()["layout"]["main_split_ratio"] == 0.66
            assert partial_layout_update.json()["layout"]["mobile_active_pane"] == "metadata"

            search = client.post("/api/v1/search", json={"query": ""})
            assert search.status_code == 200
            payload = search.json()
            assert payload["total_count"] >= 1
            entry_id = payload["ids"][0]

            entry = client.get(f"/api/v1/entries/{entry_id}")
            assert entry.status_code == 200

            preview = client.get(f"/api/v1/entries/{entry_id}/preview")
            assert preview.status_code == 200
            assert preview.json()["preview_kind"] in {"text", "image", "audio", "video", "binary"}

            media = client.get(f"/api/v1/entries/{entry_id}/media")
            assert media.status_code == 200

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


def test_tag_validation_and_parent_filtering() -> None:
    with TemporaryDirectory() as tmp:
        library_path = Path(tmp)
        seed_library(library_path)

        app = create_app()
        with TestClient(app) as client:
            open_res = client.post("/api/v1/libraries/open", json={"path": str(library_path)})
            assert open_res.status_code == 200

            parent = client.post("/api/v1/tags", json={"name": "parent"})
            child = client.post("/api/v1/tags", json={"name": "child"})
            grandchild = client.post("/api/v1/tags", json={"name": "grandchild"})
            assert parent.status_code == 200
            assert child.status_code == 200
            assert grandchild.status_code == 200

            parent_id = parent.json()["id"]
            child_id = child.json()["id"]
            grandchild_id = grandchild.json()["id"]

            child_parent = client.patch(f"/api/v1/tags/{child_id}", json={"parent_ids": [parent_id]})
            assert child_parent.status_code == 200

            grandchild_parent = client.patch(
                f"/api/v1/tags/{grandchild_id}",
                json={"parent_ids": [child_id]},
            )
            assert grandchild_parent.status_code == 200

            cycle = client.patch(f"/api/v1/tags/{parent_id}", json={"parent_ids": [child_id]})
            assert cycle.status_code == 422
            assert "Circular tag hierarchy" in cycle.json()["detail"]

            bad_create_disam = client.post(
                "/api/v1/tags",
                json={
                    "name": "invalid-disambiguation",
                    "parent_ids": [parent_id],
                    "disambiguation_id": child_id,
                },
            )
            assert bad_create_disam.status_code == 422
            assert "disambiguation_id" in bad_create_disam.json()["detail"]

            bad_patch_disam = client.patch(
                f"/api/v1/tags/{child_id}",
                json={"disambiguation_id": grandchild_id},
            )
            assert bad_patch_disam.status_code == 422
            assert "disambiguation_id" in bad_patch_disam.json()["detail"]

            shorthand_set = client.patch(f"/api/v1/tags/{child_id}", json={"shorthand": "kid"})
            assert shorthand_set.status_code == 200
            assert shorthand_set.json()["shorthand"] == "kid"

            shorthand_clear = client.patch(f"/api/v1/tags/{child_id}", json={"shorthand": None})
            assert shorthand_clear.status_code == 200
            assert shorthand_clear.json()["shorthand"] is None

            disam_set = client.patch(
                f"/api/v1/tags/{child_id}",
                json={"disambiguation_id": parent_id},
            )
            assert disam_set.status_code == 200
            assert disam_set.json()["disambiguation_id"] == parent_id

            disam_clear = client.patch(
                f"/api/v1/tags/{child_id}",
                json={"disambiguation_id": None},
            )
            assert disam_clear.status_code == 200
            assert disam_clear.json()["disambiguation_id"] is None

            all_tags = client.get("/api/v1/tags?limit=-1")
            assert all_tags.status_code == 200
            assert len(all_tags.json()) >= 4
            assert len(all_tags.json()) <= 5000

            parent_filter = client.get(f"/api/v1/tags?parent_for_tag_id={parent_id}&limit=-1")
            assert parent_filter.status_code == 200
            filtered_ids = {tag["id"] for tag in parent_filter.json()}
            assert parent_id not in filtered_ids
            assert child_id not in filtered_ids
            assert grandchild_id not in filtered_ids


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


def test_thumbnail_endpoints_and_cache_behavior() -> None:
    with TemporaryDirectory() as tmp:
        library_path = Path(tmp)
        seed_library(library_path)

        app = create_app()
        with TestClient(app) as client:
            open_res = client.post("/api/v1/libraries/open", json={"path": str(library_path)})
            assert open_res.status_code == 200

            entry_ids = get_entry_ids_by_filename(client)
            image_entry_id = entry_ids["thumb.png"]
            text_entry_id = entry_ids["foo.txt"]
            broken_video_entry_id = entry_ids["broken.webm"]

            image_preview = client.get(f"/api/v1/entries/{image_entry_id}/preview")
            assert image_preview.status_code == 200
            assert image_preview.json()["thumbnail_url"] is not None

            video_preview = client.get(f"/api/v1/entries/{broken_video_entry_id}/preview")
            assert video_preview.status_code == 200
            assert video_preview.json()["poster_url"] is not None

            first_thumb = client.get(f"/api/v1/entries/{image_entry_id}/thumbnail")
            assert first_thumb.status_code == 200
            assert first_thumb.headers["content-type"].startswith("image/webp")

            cache_dir = library_path / ".TagStudio" / "thumbs" / "web" / "v1"
            cache_files = list(cache_dir.rglob("*.webp"))
            assert len(cache_files) == 1
            initial_mtime = cache_files[0].stat().st_mtime_ns

            second_thumb = client.get(f"/api/v1/entries/{image_entry_id}/thumbnail")
            assert second_thumb.status_code == 200
            assert second_thumb.content == first_thumb.content
            cache_files = list(cache_dir.rglob("*.webp"))
            assert len(cache_files) == 1
            assert cache_files[0].stat().st_mtime_ns >= initial_mtime

            text_thumb = client.get(f"/api/v1/entries/{text_entry_id}/thumbnail")
            assert text_thumb.status_code == 415

            broken_video_thumb = client.get(f"/api/v1/entries/{broken_video_entry_id}/thumbnail")
            assert broken_video_thumb.status_code == 415


def test_thumbnail_prewarm_endpoint() -> None:
    with TemporaryDirectory() as tmp:
        library_path = Path(tmp)
        seed_library(library_path)

        app = create_app()
        with TestClient(app) as client:
            open_res = client.post("/api/v1/libraries/open", json={"path": str(library_path)})
            assert open_res.status_code == 200

            entry_ids = get_entry_ids_by_filename(client)
            image_entry_id = entry_ids["thumb.png"]
            response = client.post(
                "/api/v1/thumbnails/prewarm",
                json={
                    "entry_ids": [image_entry_id, 999_999],
                    "kind": "grid",
                    "fit": "cover",
                    "priority": "background",
                },
            )
            assert response.status_code == 202
            assert response.json()["accepted"] == 1
            assert response.json()["skipped"] == 1


def test_thumbnail_lock_is_released_after_generation_failure() -> None:
    with TemporaryDirectory() as tmp:
        library_path = Path(tmp)
        seed_library(library_path)

        app = create_app()
        with TestClient(app) as client:
            open_res = client.post("/api/v1/libraries/open", json={"path": str(library_path)})
            assert open_res.status_code == 200

            entry_ids = get_entry_ids_by_filename(client)
            image_entry_id = entry_ids["thumb.png"]

            pipeline = app.state.tagstudio.get_thumbnail_pipeline()
            assert pipeline is not None

            with patch.object(
                pipeline,
                "_render_thumbnail",
                side_effect=ThumbnailUnsupportedError("simulated failure"),
            ):
                first = client.get(f"/api/v1/entries/{image_entry_id}/thumbnail")
                second = client.get(f"/api/v1/entries/{image_entry_id}/thumbnail")

            assert first.status_code == 415
            assert second.status_code == 415


def test_thumbnail_pipeline_video_falls_back_to_ffmpeg_when_opencv_fails() -> None:
    with TemporaryDirectory() as tmp:
        library_path = Path(tmp)
        pipeline = ThumbnailPipeline(library_path)
        try:
            video_path = library_path / "fallback.mp4"
            video_path.write_bytes(b"not-a-real-video")

            options = pipeline._resolve_options(size=128, fit="cover", kind="grid")
            frame = Image.new("RGB", (48, 32), (255, 0, 0))
            original_ffmpeg_cmd = pipeline._ffmpeg_cmd

            with (
                patch.object(pipeline, "_render_video_with_opencv", return_value=None),
                patch.object(pipeline, "_probe_duration_seconds", return_value=10.0),
                patch.object(
                    pipeline,
                    "_extract_video_frame_with_ffmpeg",
                    side_effect=[frame],
                ),
            ):
                pipeline._ffmpeg_cmd = "ffmpeg"
                try:
                    result = pipeline._render_video(video_path, options)
                finally:
                    pipeline._ffmpeg_cmd = original_ffmpeg_cmd

            assert result is not None
            assert result.size == (128, 128)
        finally:
            pipeline.close()

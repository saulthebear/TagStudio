import mimetypes
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from tagstudio.api.jobs import JobManager
from tagstudio.api.schemas import (
    EntryResponse,
    FieldTypeResponse,
    HealthResponse,
    JobCreateResponse,
    JobStatusResponse,
    LibraryCreateRequest,
    LibraryOpenRequest,
    LibraryStateResponse,
    PreviewKind,
    PreviewResponse,
    SearchRequest,
    SearchResponse,
    SettingsResponse,
    SettingsUpdateRequest,
    SuccessResponse,
    TagColorResponse,
    TagColorNamespaceResponse,
    TagCreateRequest,
    TagMutationRequest,
    TagMutationResponse,
    TagResponse,
    TagUpdateRequest,
    ThumbnailFit,
    ThumbnailKind,
    ThumbnailPrewarmRequest,
    ThumbnailPrewarmResponse,
    UpdateFieldRequest,
)
from tagstudio.api.serializers import (
    serialize_entry,
    serialize_entry_summary,
    serialize_tag,
    serialize_tag_color,
)
from tagstudio.api.state import ApiState
from tagstudio.core.library.alchemy.constants import TAG_CHILDREN_ID_QUERY
from tagstudio.core.library.alchemy.enums import BrowsingState, SortingModeEnum
from tagstudio.core.library.alchemy.joins import TagParent
from tagstudio.core.library.alchemy.library import Library, LibraryStatus
from tagstudio.core.library.alchemy.models import Tag, TagAlias
from tagstudio.core.media.thumbnail_pipeline import ThumbnailUnsupportedError

TEXT_SUFFIXES = {"txt", "md", "json", "toml", "yaml", "yml", "csv", "log", "py", "ts", "tsx"}
VIDEO_SUFFIXES = {"mp4", "mov", "mkv", "webm", "avi", "m4v"}
AUDIO_SUFFIXES = {"mp3", "wav", "ogg", "flac", "m4a"}
IMAGE_SUFFIXES = {"jpg", "jpeg", "png", "gif", "webp", "bmp", "tif", "tiff", "jxl", "heic"}
TAG_LIST_SOFT_CAP = 5000


def create_router(*, state: ApiState, jobs: JobManager) -> APIRouter:
    router = APIRouter(prefix="/api/v1")

    def get_library_or_error() -> Library:
        lib = state.get_library()
        if lib is None or lib.engine is None:
            raise HTTPException(status_code=409, detail="No library open.")
        return lib

    def state_response() -> LibraryStateResponse:
        lib = state.get_library()
        if lib is None or lib.engine is None:
            return LibraryStateResponse(is_open=False)
        return LibraryStateResponse(
            is_open=True,
            library_path=str(lib.library_dir) if lib.library_dir else None,
            entries_count=lib.entries_count,
            tags_count=len(lib.tags),
        )

    def ensure_status(status: LibraryStatus) -> None:
        if not status.success:
            raise HTTPException(status_code=400, detail=status.message or "Unable to open library.")

    def resolve_entry_file(lib: Library, entry_id: int) -> tuple[Path, str]:
        entry = lib.get_entry_full(entry_id, with_fields=False, with_tags=False)
        if entry is None:
            raise HTTPException(status_code=404, detail="Entry not found.")
        if lib.library_dir is None:
            raise HTTPException(status_code=409, detail="No library open.")

        root = lib.library_dir.resolve()
        entry_path = (root / entry.path).resolve()
        try:
            entry_path.relative_to(root)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Entry path escapes library root.") from exc
        return entry_path, str(entry.path)

    def build_thumbnail_url(
        entry_id: int,
        *,
        size: int,
        fit: ThumbnailFit,
        kind: ThumbnailKind,
    ) -> str:
        params = urlencode(
            {
                "size": size,
                "fit": fit.value,
                "kind": kind.value,
            }
        )
        return f"/api/v1/entries/{entry_id}/thumbnail?{params}"

    def get_descendant_tag_ids(lib: Library, tag_id: int) -> set[int]:
        if lib.engine is None:
            return set()
        with Session(lib.engine) as session:
            return set(session.scalars(TAG_CHILDREN_ID_QUERY, {"tag_id": tag_id}))

    def validate_parent_ids_for_tag(
        lib: Library, *, tag_id: int | None, parent_ids: set[int]
    ) -> set[int]:
        if tag_id is not None and tag_id in parent_ids:
            raise HTTPException(status_code=422, detail="A tag cannot be its own parent.")

        for parent_id in parent_ids:
            if lib.get_tag(parent_id) is None:
                raise HTTPException(status_code=422, detail=f"Parent tag {parent_id} does not exist.")

        if tag_id is not None:
            descendant_ids = get_descendant_tag_ids(lib, tag_id)
            cycle_parent_ids = parent_ids.intersection(descendant_ids)
            if cycle_parent_ids:
                raise HTTPException(
                    status_code=422,
                    detail="Circular tag hierarchy is not allowed.",
                )

        return parent_ids

    def validate_disambiguation(disambiguation_id: int | None, parent_ids: set[int]) -> None:
        if disambiguation_id is None:
            return
        if disambiguation_id not in parent_ids:
            raise HTTPException(
                status_code=422,
                detail="disambiguation_id must reference one of parent_ids.",
            )
    @router.get("/health", response_model=HealthResponse)
    def health() -> HealthResponse:
        return HealthResponse()

    @router.post("/libraries/open", response_model=LibraryStateResponse)
    def open_library(request: LibraryOpenRequest) -> LibraryStateResponse:
        path = Path(request.path).expanduser().resolve()
        status = state.open_library(path)
        ensure_status(status)
        return state_response()

    @router.post("/libraries/create", response_model=LibraryStateResponse)
    def create_library(request: LibraryCreateRequest) -> LibraryStateResponse:
        path = Path(request.path).expanduser().resolve()
        status = state.create_library(path)
        ensure_status(status)
        return state_response()

    @router.get("/libraries/state", response_model=LibraryStateResponse)
    def library_state() -> LibraryStateResponse:
        return state_response()

    @router.get("/settings", response_model=SettingsResponse)
    def get_settings() -> SettingsResponse:
        return SettingsResponse.model_validate(state.get_web_settings())

    @router.patch("/settings", response_model=SettingsResponse)
    def update_settings(request: SettingsUpdateRequest) -> SettingsResponse:
        updates: dict[str, Any] = {}
        if request.sorting_mode is not None:
            updates["sorting_mode"] = request.sorting_mode.value
        if request.ascending is not None:
            updates["ascending"] = request.ascending
        if request.show_hidden_entries is not None:
            updates["show_hidden_entries"] = request.show_hidden_entries
        if request.page_size is not None:
            updates["page_size"] = request.page_size
        if request.layout is not None:
            updates["layout"] = request.layout.model_dump(exclude_none=True)
        if request.thumbnails is not None:
            updates["thumbnails"] = request.thumbnails.model_dump(exclude_none=True)
        return SettingsResponse.model_validate(state.update_web_settings(updates))

    @router.get("/field-types", response_model=list[FieldTypeResponse])
    def list_field_types() -> list[FieldTypeResponse]:
        lib = get_library_or_error()
        field_types = sorted(lib.field_types.values(), key=lambda item: item.position)
        return [
            FieldTypeResponse(
                key=field.key,
                name=field.name,
                kind=field.type.value,
                is_default=field.is_default,
                position=field.position,
            )
            for field in field_types
        ]

    @router.get("/tag-colors", response_model=list[TagColorNamespaceResponse])
    def list_tag_colors() -> list[TagColorNamespaceResponse]:
        lib = get_library_or_error()
        color_groups = lib.tag_color_groups
        payload: list[TagColorNamespaceResponse] = []
        for namespace, colors in color_groups.items():
            namespace_name = lib.get_namespace_name(namespace)
            payload.append(
                TagColorNamespaceResponse(
                    namespace=namespace,
                    namespace_name=namespace_name,
                    colors=[
                        TagColorResponse.model_validate(serialize_tag_color(namespace_name, color))
                        for color in colors
                    ],
                )
            )
        return payload

    @router.get("/tags", response_model=list[TagResponse])
    def list_tags(
        query: str | None = None,
        limit: int = 200,
        parent_for_tag_id: int | None = None,
    ) -> list[TagResponse]:
        lib = get_library_or_error()
        if limit == 0 or limit < -1:
            raise HTTPException(status_code=400, detail="limit must be -1 or >= 1")

        effective_limit = TAG_LIST_SOFT_CAP if limit == -1 else limit

        if query:
            direct_tags, ancestor_tags = lib.search_tags(query, limit=effective_limit)
            tags = sorted(direct_tags | ancestor_tags)
        else:
            tags = sorted(lib.tags)

        tags = tags[:effective_limit]

        if parent_for_tag_id is not None:
            if lib.get_tag(parent_for_tag_id) is None:
                raise HTTPException(status_code=404, detail="Tag not found.")
            disallowed_parent_ids = get_descendant_tag_ids(lib, parent_for_tag_id)
            tags = [tag for tag in tags if tag.id not in disallowed_parent_ids]

        return [TagResponse.model_validate(serialize_tag(tag)) for tag in tags]

    @router.post("/search", response_model=SearchResponse)
    def search_entries(request: SearchRequest) -> SearchResponse:
        lib = get_library_or_error()
        browsing_state = BrowsingState(
            page_index=request.page_index,
            sorting_mode=SortingModeEnum(request.sorting_mode.value),
            ascending=request.ascending,
            show_hidden_entries=request.show_hidden_entries,
            query=request.query.strip() if request.query else None,
        )
        results = lib.search_library(browsing_state, page_size=request.page_size)
        entries = []
        for entry_id in results.ids:
            entry = lib.get_entry_full(entry_id, with_fields=False, with_tags=True)
            if entry is not None:
                entries.append(serialize_entry_summary(entry))

        return SearchResponse(total_count=results.total_count, ids=results.ids, entries=entries)

    @router.get("/entries/{entry_id}", response_model=EntryResponse)
    def get_entry(entry_id: int) -> EntryResponse:
        lib = get_library_or_error()
        entry = lib.get_entry_full(entry_id, with_fields=True, with_tags=True)
        if entry is None:
            raise HTTPException(status_code=404, detail="Entry not found.")
        return EntryResponse.model_validate(serialize_entry(entry, lib.library_dir))

    @router.get("/entries/{entry_id}/preview", response_model=PreviewResponse)
    def preview_entry(entry_id: int) -> PreviewResponse:
        lib = get_library_or_error()
        entry_path, entry_rel_path = resolve_entry_file(lib, entry_id)
        if not entry_path.exists() or not entry_path.is_file():
            return PreviewResponse(
                entry_id=entry_id,
                preview_kind=PreviewKind.MISSING,
                text_excerpt=f"Missing file: {entry_rel_path}",
            )

        media_type, _ = mimetypes.guess_type(str(entry_path))
        suffix = entry_path.suffix.lower().lstrip(".")
        kind = PreviewKind.BINARY
        supports_media_controls = False
        text_excerpt: str | None = None

        if media_type is not None:
            if media_type.startswith("image/"):
                kind = PreviewKind.IMAGE
            elif media_type.startswith("video/"):
                kind = PreviewKind.VIDEO
                supports_media_controls = True
            elif media_type.startswith("audio/"):
                kind = PreviewKind.AUDIO
                supports_media_controls = True
            elif media_type.startswith("text/"):
                kind = PreviewKind.TEXT
        elif suffix in IMAGE_SUFFIXES:
            kind = PreviewKind.IMAGE
        elif suffix in VIDEO_SUFFIXES:
            kind = PreviewKind.VIDEO
            supports_media_controls = True
        elif suffix in AUDIO_SUFFIXES:
            kind = PreviewKind.AUDIO
            supports_media_controls = True
        elif suffix in TEXT_SUFFIXES:
            kind = PreviewKind.TEXT
            media_type = "text/plain; charset=utf-8"

        if kind == PreviewKind.TEXT:
            try:
                text_excerpt = entry_path.read_text(encoding="utf-8", errors="replace")[:12000]
            except Exception:
                kind = PreviewKind.BINARY
                text_excerpt = None

        thumb_settings = state.get_web_settings().get("thumbnails", {})
        preview_size = int(thumb_settings.get("preview_size", 768))
        thumbnail_url: str | None = None
        poster_url: str | None = None
        if kind in {PreviewKind.IMAGE, PreviewKind.VIDEO}:
            thumbnail_url = build_thumbnail_url(
                entry_id,
                size=preview_size,
                fit=ThumbnailFit.CONTAIN,
                kind=ThumbnailKind.PREVIEW,
            )
            if kind == PreviewKind.VIDEO:
                poster_url = thumbnail_url

        return PreviewResponse(
            entry_id=entry_id,
            preview_kind=kind,
            media_type=media_type or "application/octet-stream",
            media_url=f"/api/v1/entries/{entry_id}/media",
            thumbnail_url=thumbnail_url,
            poster_url=poster_url,
            text_excerpt=text_excerpt,
            supports_media_controls=supports_media_controls,
        )

    @router.get("/entries/{entry_id}/media")
    def entry_media(entry_id: int) -> FileResponse:
        lib = get_library_or_error()
        entry_path, _ = resolve_entry_file(lib, entry_id)
        if not entry_path.exists() or not entry_path.is_file():
            raise HTTPException(status_code=404, detail="Entry file not found.")
        media_type, _ = mimetypes.guess_type(str(entry_path))
        return FileResponse(entry_path, media_type=media_type or "application/octet-stream")

    @router.get("/entries/{entry_id}/thumbnail")
    def entry_thumbnail(
        entry_id: int,
        size: int | None = Query(default=None, ge=32, le=2048),
        fit: ThumbnailFit = ThumbnailFit.COVER,
        kind: ThumbnailKind = ThumbnailKind.GRID,
    ) -> FileResponse:
        lib = get_library_or_error()
        entry_path, _ = resolve_entry_file(lib, entry_id)
        if not entry_path.exists() or not entry_path.is_file():
            raise HTTPException(status_code=404, detail="Entry file not found.")

        pipeline = state.get_thumbnail_pipeline()
        if pipeline is None:
            raise HTTPException(status_code=409, detail="Thumbnail pipeline unavailable.")

        try:
            effective_size = size if size is not None else pipeline.get_default_size(kind.value)
            thumbnail_path = pipeline.get_or_create(
                entry_path,
                size=effective_size,
                fit=fit.value,
                kind=kind.value,
            )
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail="Entry file not found.") from exc
        except ThumbnailUnsupportedError as exc:
            raise HTTPException(
                status_code=415,
                detail="Thumbnail unsupported for this file.",
            ) from exc

        return FileResponse(
            thumbnail_path,
            media_type="image/webp",
            headers={"Cache-Control": "public, max-age=31536000, immutable"},
        )

    @router.post("/thumbnails/prewarm", response_model=ThumbnailPrewarmResponse, status_code=202)
    def prewarm_thumbnails(request: ThumbnailPrewarmRequest) -> ThumbnailPrewarmResponse:
        lib = get_library_or_error()
        pipeline = state.get_thumbnail_pipeline()
        if pipeline is None:
            raise HTTPException(status_code=409, detail="Thumbnail pipeline unavailable.")

        entry_paths: list[Path] = []
        skipped = 0
        for entry_id in request.entry_ids:
            try:
                entry_path, _ = resolve_entry_file(lib, entry_id)
            except HTTPException:
                skipped += 1
                continue
            if not entry_path.exists() or not entry_path.is_file():
                skipped += 1
                continue
            entry_paths.append(entry_path)

        result = pipeline.enqueue_prewarm(
            entry_paths,
            size=request.size,
            fit=request.fit.value,
            kind=request.kind.value,
            priority=request.priority.value,
        )
        return ThumbnailPrewarmResponse(
            accepted=result.accepted,
            skipped=result.skipped + skipped,
        )

    @router.patch("/entries/{entry_id}/fields/{field_key}", response_model=EntryResponse)
    def update_entry_field(
        entry_id: int, field_key: str, request: UpdateFieldRequest
    ) -> EntryResponse:
        lib = get_library_or_error()
        entry = lib.get_entry_full(entry_id, with_fields=True, with_tags=True)
        if entry is None:
            raise HTTPException(status_code=404, detail="Entry not found.")

        target_field = next((field for field in entry.fields if field.type_key == field_key), None)
        if target_field is None:
            ok = lib.add_field_to_entry(entry_id=entry_id, field_id=field_key, value=request.value)
            if not ok:
                raise HTTPException(status_code=400, detail="Unable to create field.")
        else:
            lib.update_entry_field(entry_ids=entry_id, field=target_field, content=request.value)

        updated_entry = lib.get_entry_full(entry_id, with_fields=True, with_tags=True)
        if updated_entry is None:
            raise HTTPException(status_code=404, detail="Entry not found after update.")
        return EntryResponse.model_validate(serialize_entry(updated_entry, lib.library_dir))

    @router.post("/entries/tags:add", response_model=TagMutationResponse)
    def add_tags_to_entries(request: TagMutationRequest) -> TagMutationResponse:
        lib = get_library_or_error()
        changed = lib.add_tags_to_entries(request.entry_ids, request.tag_ids)
        return TagMutationResponse(success=True, changed=changed)

    @router.post("/entries/tags:remove", response_model=TagMutationResponse)
    def remove_tags_from_entries(request: TagMutationRequest) -> TagMutationResponse:
        lib = get_library_or_error()
        success = lib.remove_tags_from_entries(request.entry_ids, request.tag_ids)
        changed = len(request.entry_ids) * len(request.tag_ids) if success else 0
        return TagMutationResponse(success=success, changed=changed)

    @router.post("/tags", response_model=TagResponse)
    def create_tag(request: TagCreateRequest) -> TagResponse:
        lib = get_library_or_error()
        parent_ids = validate_parent_ids_for_tag(lib, tag_id=None, parent_ids=set(request.parent_ids))
        validate_disambiguation(request.disambiguation_id, parent_ids)

        tag = Tag(
            name=request.name,
            shorthand=request.shorthand,
            color_namespace=request.color_namespace,
            color_slug=request.color_slug,
            disambiguation_id=request.disambiguation_id,
            is_category=request.is_category,
            is_hidden=request.is_hidden,
        )

        created = lib.add_tag(
            tag=tag,
            parent_ids=parent_ids,
            alias_names=set(request.aliases),
            alias_ids=set(),
        )
        if created is None:
            raise HTTPException(status_code=409, detail="Tag already exists or cannot be created.")
        created_full = lib.get_tag(created.id)
        if created_full is None:
            raise HTTPException(status_code=500, detail="Failed to load created tag.")
        return TagResponse.model_validate(serialize_tag(created_full))

    @router.patch("/tags/{tag_id}", response_model=TagResponse)
    def update_tag(tag_id: int, request: TagUpdateRequest) -> TagResponse:
        lib = get_library_or_error()
        if lib.engine is None:
            raise HTTPException(status_code=409, detail="No library open.")

        provided_fields = request.model_fields_set

        with Session(lib.engine) as session:
            tag = session.get(Tag, tag_id)
            if tag is None:
                raise HTTPException(status_code=404, detail="Tag not found.")

            if "name" in provided_fields and request.name is None:
                raise HTTPException(status_code=422, detail="name cannot be null.")
            if "name" in provided_fields and request.name is not None:
                tag.name = request.name
            if "shorthand" in provided_fields:
                tag.shorthand = request.shorthand
            if "color_namespace" in provided_fields:
                tag.color_namespace = request.color_namespace
            if "color_slug" in provided_fields:
                tag.color_slug = request.color_slug
            if "is_category" in provided_fields and request.is_category is not None:
                tag.is_category = request.is_category
            if "is_hidden" in provided_fields and request.is_hidden is not None:
                tag.is_hidden = request.is_hidden

            existing_parent_ids = {
                parent_id
                for parent_id, in session.execute(
                    select(TagParent.parent_id).where(TagParent.child_id == tag_id)
                ).all()
            }
            requested_parent_ids = set(request.parent_ids or []) if "parent_ids" in provided_fields else None
            effective_parent_ids = (
                requested_parent_ids if requested_parent_ids is not None else existing_parent_ids
            )
            effective_parent_ids = validate_parent_ids_for_tag(
                lib,
                tag_id=tag_id,
                parent_ids=set(effective_parent_ids),
            )

            if "disambiguation_id" in provided_fields:
                validate_disambiguation(request.disambiguation_id, effective_parent_ids)
                tag.disambiguation_id = request.disambiguation_id
            elif tag.disambiguation_id is not None and requested_parent_ids is not None:
                if tag.disambiguation_id not in effective_parent_ids:
                    tag.disambiguation_id = None

            if requested_parent_ids is not None:
                session.execute(delete(TagParent).where(TagParent.child_id == tag_id))
                for parent_id in effective_parent_ids:
                    session.add(TagParent(parent_id=parent_id, child_id=tag_id))

            if "aliases" in provided_fields:
                existing_aliases = session.scalars(
                    select(TagAlias).where(TagAlias.tag_id == tag_id)
                ).all()
                desired_aliases = {alias for alias in (request.aliases or []) if alias}
                existing_by_name = {alias.name: alias for alias in existing_aliases}

                for alias in existing_aliases:
                    if alias.name not in desired_aliases:
                        session.delete(alias)
                for alias_name in desired_aliases:
                    if alias_name not in existing_by_name:
                        session.add(TagAlias(name=alias_name, tag_id=tag_id))

            session.commit()

        updated = lib.get_tag(tag_id)
        if updated is None:
            raise HTTPException(status_code=404, detail="Tag not found after update.")
        return TagResponse.model_validate(serialize_tag(updated))

    @router.delete("/tags/{tag_id}", response_model=SuccessResponse)
    def delete_tag(tag_id: int) -> SuccessResponse:
        lib = get_library_or_error()
        tag = lib.get_tag(tag_id)
        if tag is None:
            raise HTTPException(status_code=404, detail="Tag not found.")
        lib.remove_tag(tag_id)
        return SuccessResponse(success=True)

    @router.post("/jobs/refresh", response_model=JobCreateResponse)
    def start_refresh_job() -> JobCreateResponse:
        lib = get_library_or_error()
        job = jobs.start_refresh(lib)
        return JobCreateResponse(job_id=job.id, status=job.status)

    @router.get("/jobs/{job_id}", response_model=JobStatusResponse)
    def get_job(job_id: str) -> JobStatusResponse:
        job = jobs.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Job not found.")
        return JobStatusResponse.model_validate(job.as_dict())

    @router.get("/jobs/{job_id}/events")
    def stream_job(job_id: str) -> StreamingResponse:
        try:
            stream = jobs.stream(job_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Job not found.") from exc
        return StreamingResponse(stream, media_type="text/event-stream")

    return router

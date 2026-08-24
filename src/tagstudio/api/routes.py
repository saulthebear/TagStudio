import mimetypes
import os
import secrets
import shutil
import sys
import time
from hashlib import sha256
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

import structlog
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse, StreamingResponse
from send2trash import send2trash

from tagstudio.api.jobs import JobManager
from tagstudio.api.schemas import (
    EntryResponse,
    EntryShellActionFailureReasonCode,
    FieldTypeResponse,
    HealthResponse,
    JobCreateResponse,
    JobStatusResponse,
    LibraryCreateRequest,
    LibraryOpenRequest,
    LibraryStateResponse,
    OpenEntriesRequest,
    OpenEntriesResponse,
    PreviewKind,
    PreviewResponse,
    RemuxBackupInfoResponse,
    RemuxCheckResponse,
    RemuxPurgeResponse,
    RevealEntryRequest,
    SearchRequest,
    SearchResponse,
    SettingsResponse,
    SettingsUpdateRequest,
    SuccessResponse,
    SystemTagsSyncResponse,
    TagColorNamespaceResponse,
    TagColorResponse,
    TagCreateRequest,
    TagMutationRequest,
    TagMutationResponse,
    TagResponse,
    TagSearchResponse,
    TagStatResponse,
    TagStatsResponse,
    TagCoOccurrence,
    TagUpdateRequest,
    ThumbnailFit,
    ThumbnailKind,
    ThumbnailPrewarmRequest,
    ThumbnailPrewarmResponse,
    TrashEntriesRequest,
    TrashEntriesResponse,
    TrashFailureReasonCode,
    UpdateFieldRequest,
)
from tagstudio.api.serializers import (
    serialize_entry,
    serialize_entry_summary,
    serialize_tag,
    serialize_tag_color,
    serialize_tag_stat,
)
from tagstudio.api.services.entry_service import (
    open_entries as open_entries_service,
)
from tagstudio.api.services.entry_service import (
    reveal_entry as reveal_entry_service,
)
from tagstudio.api.services.entry_service import (
    trash_entries as trash_entries_service,
)
from tagstudio.api.services.tag_service import (
    create_tag as create_tag_service,
)
from tagstudio.api.services.tag_service import (
    get_descendant_tag_ids,
)
from tagstudio.api.services.tag_service import (
    update_tag as update_tag_service,
)
from tagstudio.api.state import ApiState
from tagstudio.core.constants import TS_FOLDER_NAME
from tagstudio.core.library.alchemy.enums import BrowsingState, SortingModeEnum
from tagstudio.core.library.alchemy.library import Library, LibraryStatus
from tagstudio.core.library.system_tags import sync_retroactive_system_tags
from tagstudio.core.media.remux import (
    VIDEO_EXTENSIONS,
    find_ffprobe,
    get_backup_size,
    needs_remux,
    purge_backups,
)
from tagstudio.core.media.thumbnail_pipeline import ThumbnailUnsupportedError

from tagstudio.core.utils.silent_subprocess import silent_popen

TEXT_SUFFIXES = {"txt", "md", "json", "toml", "yaml", "yml", "csv", "log", "py", "ts", "tsx"}
VIDEO_SUFFIXES = {"mp4", "mov", "mkv", "webm", "avi", "m4v"}
AUDIO_SUFFIXES = {"mp3", "wav", "ogg", "flac", "m4a"}
IMAGE_SUFFIXES = {"jpg", "jpeg", "png", "gif", "webp", "bmp", "tif", "tiff", "jxl", "heic"}
TAG_LIST_SOFT_CAP = 5000
SEARCH_PAGE_SOFT_CAP = 1000

logger = structlog.get_logger(__name__)


def create_router(*, state: ApiState, jobs: JobManager) -> APIRouter:
    router = APIRouter(prefix="/api/v1")

    def get_library_or_error() -> Library:
        lib = state.get_library()
        if lib is None or lib.engine is None:
            raise HTTPException(status_code=409, detail="No library open.")
        return lib

    def state_response() -> LibraryStateResponse:
        start = time.perf_counter()
        lib = state.get_library()
        if lib is None or lib.engine is None:
            return LibraryStateResponse(is_open=False)
        response = LibraryStateResponse(
            is_open=True,
            library_path=str(lib.library_dir) if lib.library_dir else None,
            entries_count=lib.entries_count,
            tags_count=lib.tags_count,
        )
        logger.info(
            "api.library_state",
            duration_ms=round((time.perf_counter() - start) * 1000, 2),
            rows_returned=1,
            library_path_hash=_library_path_hash(lib),
        )
        return response

    def _library_path_hash(lib: Library) -> str | None:
        if lib.library_dir is None:
            return None
        return sha256(str(lib.library_dir).encode("utf-8")).hexdigest()[:12]

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

    def trash_file(path: Path) -> TrashFailureReasonCode | None:
        try:
            send2trash(path)
            return None
        except PermissionError:
            return TrashFailureReasonCode.PERMISSION_DENIED
        except FileNotFoundError:
            return TrashFailureReasonCode.MISSING_ON_DISK
        except OSError:
            return TrashFailureReasonCode.OS_ERROR
        except Exception:
            return TrashFailureReasonCode.UNKNOWN_ERROR

    def open_path_in_default_app(path: Path) -> EntryShellActionFailureReasonCode | None:
        try:
            if sys.platform == "win32":
                os.startfile(path)  # type: ignore[attr-defined]
                return None

            command_name = "open" if sys.platform == "darwin" else "xdg-open"
            command = shutil.which(command_name)
            if command is None:
                return EntryShellActionFailureReasonCode.COMMAND_NOT_FOUND
            silent_popen([command, str(path)], close_fds=True)
            return None
        except PermissionError:
            return EntryShellActionFailureReasonCode.PERMISSION_DENIED
        except OSError:
            return EntryShellActionFailureReasonCode.OS_ERROR
        except Exception:
            return EntryShellActionFailureReasonCode.UNKNOWN_ERROR

    def reveal_path_in_file_manager(path: Path) -> EntryShellActionFailureReasonCode | None:
        try:
            if sys.platform == "win32":
                command = f'explorer /select,"{path.resolve()}"'
                silent_popen(command, shell=True, close_fds=True)
                return None

            if sys.platform == "darwin":
                command = shutil.which("open")
                if command is None:
                    return EntryShellActionFailureReasonCode.COMMAND_NOT_FOUND
                silent_popen([command, "-R", str(path)], close_fds=True)
                return None

            dbus_command = shutil.which("dbus-send")
            if dbus_command is not None:
                silent_popen(
                    [
                        dbus_command,
                        "--session",
                        "--dest=org.freedesktop.FileManager1",
                        "--type=method_call",
                        "/org/freedesktop/FileManager1",
                        "org.freedesktop.FileManager1.ShowItems",
                        f"array:string:file://{path.resolve()}",
                        "string:",
                    ],
                    close_fds=True,
                )
                return None

            open_command = shutil.which("xdg-open")
            if open_command is None:
                return EntryShellActionFailureReasonCode.COMMAND_NOT_FOUND
            silent_popen([open_command, str(path.parent)], close_fds=True)
            return None
        except PermissionError:
            return EntryShellActionFailureReasonCode.PERMISSION_DENIED
        except OSError:
            return EntryShellActionFailureReasonCode.OS_ERROR
        except Exception:
            return EntryShellActionFailureReasonCode.UNKNOWN_ERROR

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
        if request.confirmations is not None:
            updates["confirmations"] = request.confirmations.model_dump(exclude_none=True)
        if request.remux is not None:
            updates["remux"] = request.remux.model_dump(mode="json", exclude_none=True)
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

        effective_limit = TAG_LIST_SOFT_CAP if limit == -1 else min(limit, TAG_LIST_SOFT_CAP)

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

    @router.get("/tags/search", response_model=TagSearchResponse)
    def search_tags_paginated(
        query: str | None = None,
        limit: int = 200,
        offset: int = 0,
        parent_for_tag_id: int | None = None,
    ) -> TagSearchResponse:
        lib = get_library_or_error()
        if limit < 1:
            raise HTTPException(status_code=400, detail="limit must be >= 1")
        if offset < 0:
            raise HTTPException(status_code=400, detail="offset must be >= 0")

        effective_limit = min(limit, TAG_LIST_SOFT_CAP)
        excluded_tag_ids: set[int] | None = None
        if parent_for_tag_id is not None:
            if lib.get_tag(parent_for_tag_id) is None:
                raise HTTPException(status_code=404, detail="Tag not found.")
            excluded_tag_ids = get_descendant_tag_ids(lib, parent_for_tag_id)

        items, total_count = lib.search_tags_page(
            query,
            limit=effective_limit,
            offset=offset,
            excluded_tag_ids=excluded_tag_ids,
        )
        has_more = offset + len(items) < total_count
        return TagSearchResponse(
            items=[TagResponse.model_validate(serialize_tag(tag)) for tag in items],
            total_count=total_count,
            offset=offset,
            limit=effective_limit,
            has_more=has_more,
        )

    @router.get("/tags/stats", response_model=TagStatsResponse)
    def get_tag_stats(co_occurrences_limit: int = 500) -> TagStatsResponse:
        lib = get_library_or_error()
        start = time.perf_counter()
        tag_stats = lib.get_tag_stats()
        co_occurrences_raw = lib.get_tag_co_occurrences(
            limit=min(max(co_occurrences_limit, 0), 2000)
        )

        tags = [
            TagStatResponse.model_validate(serialize_tag_stat(tag, count))
            for tag, count in tag_stats
        ]
        co_occurrences = [
            TagCoOccurrence(tag_id_a=a, tag_id_b=b, shared_count=count)
            for a, b, count in co_occurrences_raw
        ]

        logger.info(
            "api.tags.stats",
            duration_ms=round((time.perf_counter() - start) * 1000, 2),
            tags_count=len(tags),
            co_occurrences_count=len(co_occurrences),
            library_path_hash=_library_path_hash(lib),
        )
        return TagStatsResponse(tags=tags, co_occurrences=co_occurrences)

    @router.post("/search", response_model=SearchResponse)
    def search_entries(request: SearchRequest) -> SearchResponse:
        lib = get_library_or_error()
        start = time.perf_counter()
        sorting_mode = SortingModeEnum(request.sorting_mode.value)
        effective_random_seed: float | None = None
        if sorting_mode == SortingModeEnum.RANDOM:
            # Keep seed values in a precision-safe range for SQL trig-based ordering.
            effective_random_seed = (
                request.random_seed
                if request.random_seed is not None
                else secrets.SystemRandom().uniform(0.1, 100.0)
            )

        browsing_state = BrowsingState(
            page_index=request.page_index,
            sorting_mode=sorting_mode,
            ascending=request.ascending,
            random_seed=effective_random_seed if effective_random_seed is not None else 0.0,
            show_hidden_entries=request.show_hidden_entries,
            query=request.query.strip() if request.query else None,
        )
        effective_page_size = min(request.page_size, SEARCH_PAGE_SOFT_CAP)
        if request.page_size != effective_page_size:
            logger.warning(
                "api.search.page_size_capped",
                requested_page_size=request.page_size,
                effective_page_size=effective_page_size,
                library_path_hash=_library_path_hash(lib),
            )
        results = lib.search_library(browsing_state, page_size=effective_page_size)
        summaries_by_id = {
            entry.id: serialize_entry_summary(entry) for entry in lib.get_entries_full(results.ids)
        }
        entries = [
            summaries_by_id[entry_id] for entry_id in results.ids if entry_id in summaries_by_id
        ]

        response = SearchResponse(
            total_count=results.total_count,
            ids=results.ids,
            entries=entries,
            random_seed=effective_random_seed,
        )
        logger.info(
            "api.search",
            duration_ms=round((time.perf_counter() - start) * 1000, 2),
            rows_returned=len(entries),
            total_count=results.total_count,
            sorting_mode=sorting_mode.value,
            page_size=effective_page_size,
            library_path_hash=_library_path_hash(lib),
        )
        return response

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
        start = time.perf_counter()
        changed = lib.add_tags_to_entries(request.entry_ids, request.tag_ids)
        logger.info(
            "api.tags.add",
            duration_ms=round((time.perf_counter() - start) * 1000, 2),
            rows_returned=changed,
            entry_ids_count=len(set(request.entry_ids)),
            tag_ids_count=len(set(request.tag_ids)),
            library_path_hash=_library_path_hash(lib),
        )
        return TagMutationResponse(success=True, changed=changed)

    @router.post("/entries/tags:remove", response_model=TagMutationResponse)
    def remove_tags_from_entries(request: TagMutationRequest) -> TagMutationResponse:
        lib = get_library_or_error()
        start = time.perf_counter()
        changed = lib.remove_tags_from_entries(request.entry_ids, request.tag_ids)
        logger.info(
            "api.tags.remove",
            duration_ms=round((time.perf_counter() - start) * 1000, 2),
            rows_returned=changed,
            entry_ids_count=len(set(request.entry_ids)),
            tag_ids_count=len(set(request.tag_ids)),
            library_path_hash=_library_path_hash(lib),
        )
        return TagMutationResponse(success=True, changed=changed)

    @router.post("/entries:trash", response_model=TrashEntriesResponse)
    def trash_entries(request: TrashEntriesRequest) -> TrashEntriesResponse:
        lib = get_library_or_error()
        return trash_entries_service(
            lib,
            request.entry_ids,
            resolve_entry_file=resolve_entry_file,
            trash_file=trash_file,
        )

    @router.post("/entries:open", response_model=OpenEntriesResponse)
    def open_entries(request: OpenEntriesRequest) -> OpenEntriesResponse:
        lib = get_library_or_error()
        return open_entries_service(
            lib,
            request.entry_ids,
            resolve_entry_file=resolve_entry_file,
            open_path=open_path_in_default_app,
        )

    @router.post("/entries:reveal", response_model=SuccessResponse)
    def reveal_entry(request: RevealEntryRequest) -> SuccessResponse:
        lib = get_library_or_error()
        return reveal_entry_service(
            lib,
            request.entry_id,
            resolve_entry_file=resolve_entry_file,
            reveal_path=reveal_path_in_file_manager,
        )

    @router.post("/tags", response_model=TagResponse)
    def create_tag(request: TagCreateRequest) -> TagResponse:
        lib = get_library_or_error()
        created = create_tag_service(lib, request)
        return TagResponse.model_validate(serialize_tag(created))

    @router.patch("/tags/{tag_id}", response_model=TagResponse)
    def update_tag(tag_id: int, request: TagUpdateRequest) -> TagResponse:
        lib = get_library_or_error()
        updated = update_tag_service(lib, tag_id, request)
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
        settings = state.get_web_settings()
        remux_settings = settings.get("remux", {})
        remux_mode = remux_settings.get("mode", "backup")
        remux_on_import = remux_settings.get("on_import", "ask")
        job = jobs.start_refresh(lib, remux_mode=remux_mode, remux_on_import=remux_on_import)
        return JobCreateResponse(job_id=job.id, status=job.status)

    @router.post("/jobs/remux", response_model=JobCreateResponse)
    def start_remux_job() -> JobCreateResponse:
        lib = get_library_or_error()
        settings = state.get_web_settings()
        remux_settings = settings.get("remux", {})
        remux_mode = remux_settings.get("mode", "backup")
        job = jobs.start_remux(lib, mode=remux_mode)
        return JobCreateResponse(job_id=job.id, status=job.status)

    @router.post("/jobs/remux:check", response_model=RemuxCheckResponse)
    def check_remux_candidates() -> RemuxCheckResponse:
        lib = get_library_or_error()
        library_dir = lib.library_dir
        if library_dir is None:
            raise HTTPException(status_code=409, detail="No library open.")
        ffprobe_cmd = find_ffprobe()
        if not ffprobe_cmd:
            return RemuxCheckResponse(candidates_count=0, total_scanned=0)

        total_scanned = 0
        candidates_count = 0
        for entry in lib.all_entries():
            suffix = entry.path.suffix.lower().lstrip(".")
            if suffix in VIDEO_EXTENSIONS:
                total_scanned += 1
                full_p = library_dir / entry.path
                if full_p.is_file() and needs_remux(full_p, ffprobe_cmd):
                    candidates_count += 1

        return RemuxCheckResponse(candidates_count=candidates_count, total_scanned=total_scanned)

    @router.get("/remux/backups", response_model=RemuxBackupInfoResponse)
    def get_remux_backup_info() -> RemuxBackupInfoResponse:
        lib = get_library_or_error()
        if lib.library_dir is None:
            return RemuxBackupInfoResponse(total_bytes=0, file_count=0)
        backup_dir = lib.library_dir / TS_FOLDER_NAME / "remux_backups"
        total_bytes, file_count = get_backup_size(backup_dir)
        return RemuxBackupInfoResponse(total_bytes=total_bytes, file_count=file_count)

    @router.post("/remux/purge-backups", response_model=RemuxPurgeResponse)
    def purge_remux_backups_endpoint() -> RemuxPurgeResponse:
        lib = get_library_or_error()
        if lib.library_dir is None:
            return RemuxPurgeResponse(files_deleted=0)
        backup_dir = lib.library_dir / TS_FOLDER_NAME / "remux_backups"
        deleted = purge_backups(backup_dir)
        return RemuxPurgeResponse(files_deleted=deleted)

    @router.post("/system-tags:sync", response_model=SystemTagsSyncResponse)
    def sync_system_tags_endpoint() -> SystemTagsSyncResponse:
        lib = get_library_or_error()
        summary = sync_retroactive_system_tags(lib)
        return SystemTagsSyncResponse.model_validate(summary)

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


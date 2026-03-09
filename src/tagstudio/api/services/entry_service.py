from collections.abc import Callable
from pathlib import Path

from fastapi import HTTPException

from tagstudio.api.schemas import (
    EntryShellActionFailure,
    EntryShellActionFailureReasonCode,
    OpenEntriesResponse,
    SuccessResponse,
    TrashEntriesResponse,
    TrashEntryFailure,
    TrashFailureReasonCode,
)
from tagstudio.core.library.alchemy.library import Library

ResolveEntryFileFn = Callable[[Library, int], tuple[Path, str]]
TrashFileFn = Callable[[Path], TrashFailureReasonCode | None]
OpenPathFn = Callable[[Path], EntryShellActionFailureReasonCode | None]
RevealPathFn = Callable[[Path], EntryShellActionFailureReasonCode | None]


def trash_entries(
    lib: Library,
    entry_ids: list[int],
    *,
    resolve_entry_file: ResolveEntryFileFn,
    trash_file: TrashFileFn,
) -> TrashEntriesResponse:
    deleted_entry_ids: list[int] = []
    failed_entries: list[TrashEntryFailure] = []
    seen: set[int] = set()

    for entry_id in entry_ids:
        if entry_id in seen:
            continue
        seen.add(entry_id)

        try:
            entry_path, relative_path = resolve_entry_file(lib, entry_id)
        except HTTPException as exc:
            reason = (
                TrashFailureReasonCode.ENTRY_NOT_FOUND
                if exc.status_code == 404
                else TrashFailureReasonCode.UNKNOWN_ERROR
            )
            failed_entries.append(
                TrashEntryFailure(entry_id=entry_id, path=None, reason_code=reason)
            )
            continue

        if not entry_path.exists():
            failed_entries.append(
                TrashEntryFailure(
                    entry_id=entry_id,
                    path=relative_path,
                    reason_code=TrashFailureReasonCode.MISSING_ON_DISK,
                )
            )
            continue

        if not entry_path.is_file():
            failed_entries.append(
                TrashEntryFailure(
                    entry_id=entry_id,
                    path=relative_path,
                    reason_code=TrashFailureReasonCode.NOT_A_FILE,
                )
            )
            continue

        reason = trash_file(entry_path)
        if reason is None:
            deleted_entry_ids.append(entry_id)
            continue

        failed_entries.append(
            TrashEntryFailure(
                entry_id=entry_id,
                path=relative_path,
                reason_code=reason,
            )
        )

    if deleted_entry_ids:
        lib.remove_entries(deleted_entry_ids)

    return TrashEntriesResponse(
        success=len(failed_entries) == 0,
        deleted_entry_ids=deleted_entry_ids,
        deleted_count=len(deleted_entry_ids),
        failed_count=len(failed_entries),
        failed_entries=failed_entries,
    )


def open_entries(
    lib: Library,
    entry_ids: list[int],
    *,
    resolve_entry_file: ResolveEntryFileFn,
    open_path: OpenPathFn,
) -> OpenEntriesResponse:
    opened_entry_ids: list[int] = []
    failed_entries: list[EntryShellActionFailure] = []
    seen: set[int] = set()

    for entry_id in entry_ids:
        if entry_id in seen:
            continue
        seen.add(entry_id)

        try:
            entry_path, relative_path = resolve_entry_file(lib, entry_id)
        except HTTPException as exc:
            reason = (
                EntryShellActionFailureReasonCode.ENTRY_NOT_FOUND
                if exc.status_code == 404
                else EntryShellActionFailureReasonCode.UNKNOWN_ERROR
            )
            failed_entries.append(
                EntryShellActionFailure(entry_id=entry_id, path=None, reason_code=reason)
            )
            continue

        if not entry_path.exists():
            failed_entries.append(
                EntryShellActionFailure(
                    entry_id=entry_id,
                    path=relative_path,
                    reason_code=EntryShellActionFailureReasonCode.MISSING_ON_DISK,
                )
            )
            continue

        if not entry_path.is_file():
            failed_entries.append(
                EntryShellActionFailure(
                    entry_id=entry_id,
                    path=relative_path,
                    reason_code=EntryShellActionFailureReasonCode.NOT_A_FILE,
                )
            )
            continue

        reason = open_path(entry_path)
        if reason is None:
            opened_entry_ids.append(entry_id)
            continue

        failed_entries.append(
            EntryShellActionFailure(
                entry_id=entry_id,
                path=relative_path,
                reason_code=reason,
            )
        )

    return OpenEntriesResponse(
        success=len(failed_entries) == 0,
        opened_entry_ids=opened_entry_ids,
        opened_count=len(opened_entry_ids),
        failed_count=len(failed_entries),
        failed_entries=failed_entries,
    )


def reveal_entry(
    lib: Library,
    entry_id: int,
    *,
    resolve_entry_file: ResolveEntryFileFn,
    reveal_path: RevealPathFn,
) -> SuccessResponse:
    entry_path, _ = resolve_entry_file(lib, entry_id)

    if not entry_path.exists():
        raise HTTPException(status_code=404, detail="File is missing on disk.")
    if not entry_path.is_file():
        raise HTTPException(status_code=400, detail="Path is not a regular file.")

    reason = reveal_path(entry_path)
    if reason is None:
        return SuccessResponse(success=True)
    if reason == EntryShellActionFailureReasonCode.COMMAND_NOT_FOUND:
        raise HTTPException(status_code=501, detail="No file manager command is available.")
    if reason == EntryShellActionFailureReasonCode.PERMISSION_DENIED:
        raise HTTPException(
            status_code=403,
            detail="Permission denied while opening file manager.",
        )
    raise HTTPException(status_code=500, detail="Failed to reveal file in file manager.")

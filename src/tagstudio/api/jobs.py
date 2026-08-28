import json
import threading
from collections.abc import Generator
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from queue import Empty, Queue
from uuid import uuid4

import structlog

from tagstudio.core.constants import TS_FOLDER_NAME
from tagstudio.core.library.alchemy.library import Library
from tagstudio.core.library.refresh import RefreshTracker
from tagstudio.core.library.system_tags import (
    TAG_SYSTEM_CORRUPTED,
    TAG_SYSTEM_REMUXED,
    TAG_SYSTEM_UNSUPPORTED,
    tag_entries_with_system_tag,
)
from tagstudio.core.media.remux import (
    VIDEO_EXTENSIONS,
    VideoInspectionStatus,
    find_ffmpeg,
    find_ffprobe,
    inspect_video,
    remux_to_mp4,
)

logger = structlog.get_logger(__name__)

TERMINAL_STATUSES = {"completed", "failed"}


@dataclass
class JobRecord:
    id: str
    operation: str
    status: str
    progress_current: int = 0
    progress_total: int | None = None
    message: str | None = None
    error: str | None = None
    remux_candidates_count: int | None = None
    events: list[tuple[str, dict]] = field(default_factory=list)
    subscribers: list[Queue[tuple[str, dict]]] = field(default_factory=list)

    @property
    def is_terminal(self) -> bool:
        return self.status in TERMINAL_STATUSES

    def as_dict(self) -> dict:
        return {
            "job_id": self.id,
            "operation": self.operation,
            "status": self.status,
            "progress_current": self.progress_current,
            "progress_total": self.progress_total,
            "message": self.message,
            "error": self.error,
            "is_terminal": self.is_terminal,
            "remux_candidates_count": self.remux_candidates_count,
        }


class JobManager:
    """Thread-safe in-process background job manager with SSE event fanout."""

    def __init__(self):
        self._jobs: dict[str, JobRecord] = {}
        self._lock = threading.Lock()

    def start_refresh(
        self,
        library: Library,
        *,
        remux_mode: str = "backup",
        remux_on_import: str = "ask",
    ) -> JobRecord:
        job = JobRecord(
            id=str(uuid4()),
            operation="refresh",
            status="queued",
            message="Queued",
        )
        with self._lock:
            self._jobs[job.id] = job

        thread = threading.Thread(
            target=self._run_refresh,
            args=(job.id, library),
            kwargs={"remux_mode": remux_mode, "remux_on_import": remux_on_import},
            daemon=True,
            name=f"tagstudio-refresh-{job.id}",
        )
        thread.start()
        return job

    def start_remux(self, library: Library, *, mode: str = "backup") -> JobRecord:
        job = JobRecord(
            id=str(uuid4()),
            operation="remux",
            status="queued",
            message="Queued",
        )
        with self._lock:
            self._jobs[job.id] = job

        thread = threading.Thread(
            target=self._run_remux,
            args=(job.id, library, mode),
            daemon=True,
            name=f"tagstudio-remux-{job.id}",
        )
        thread.start()
        return job

    def get(self, job_id: str) -> JobRecord | None:
        with self._lock:
            return self._jobs.get(job_id)

    def stream(self, job_id: str) -> Generator[str]:
        job = self.get(job_id)
        if job is None:
            raise KeyError(job_id)

        queue: Queue[tuple[str, dict]] = Queue()
        with self._lock:
            job = self._jobs[job_id]
            backlog = list(job.events)
            job.subscribers.append(queue)

        try:
            for event_name, payload in backlog:
                yield self._format_sse(event_name, payload)
            while True:
                try:
                    event_name, payload = queue.get(timeout=15)
                except Empty:
                    # Keep-alive comment to avoid idle connection timeouts.
                    yield ": keep-alive\n\n"
                    continue

                yield self._format_sse(event_name, payload)
                if payload["status"] in TERMINAL_STATUSES:
                    break
        finally:
            with self._lock:
                current = self._jobs.get(job_id)
                if current is not None and queue in current.subscribers:
                    current.subscribers.remove(queue)

    def _run_refresh(
        self,
        job_id: str,
        library: Library,
        *,
        remux_mode: str = "backup",
        remux_on_import: str = "ask",
    ) -> None:
        self._emit(
            job_id,
            "job.started",
            status="running",
            message="Refresh started.",
            progress_current=0,
            progress_total=None,
        )

        try:
            library_dir = library.library_dir
            if library_dir is None:
                raise ValueError("No library open.")

            tracker = RefreshTracker(library=library)
            scanned_count = 0
            for scanned_count in tracker.refresh_dir(library_dir):
                self._emit(
                    job_id,
                    "job.progress",
                    status="running",
                    message="Scanning files.",
                    progress_current=scanned_count,
                    progress_total=None,
                )

            new_file_paths = list(tracker.files_not_in_library)
            to_save = tracker.files_count
            self._emit(
                job_id,
                "job.progress",
                status="running",
                message="Saving new files.",
                progress_current=0,
                progress_total=to_save,
            )

            saved = 0
            for saved in tracker.save_new_files():
                self._emit(
                    job_id,
                    "job.progress",
                    status="running",
                    message="Saving new files.",
                    progress_current=saved,
                    progress_total=to_save,
                )

            remux_candidates_count: int | None = None
            if to_save > 0 and remux_on_import != "off":
                ffprobe_cmd = find_ffprobe()
                ffmpeg_cmd = find_ffmpeg()
                if ffprobe_cmd:
                    candidate_paths: list[Path] = []
                    for rel_p in new_file_paths:
                        suffix = rel_p.suffix.lower().lstrip(".")
                        if suffix in VIDEO_EXTENSIONS:
                            full_p = library_dir / rel_p
                            if full_p.is_file():
                                inspection = inspect_video(full_p, ffprobe_cmd)
                                if inspection == VideoInspectionStatus.REMUXABLE:
                                    candidate_paths.append(rel_p)
                                elif inspection == VideoInspectionStatus.CORRUPTED:
                                    entry = library.get_entry_full_by_path(rel_p)
                                    if entry is not None:
                                        try:
                                            tag_entries_with_system_tag(
                                                library, entry.id, TAG_SYSTEM_CORRUPTED
                                            )
                                        except Exception as exc:
                                            logger.warning(
                                                "tag_corrupted.failed",
                                                path=str(rel_p),
                                                error=str(exc),
                                            )
                                elif inspection == VideoInspectionStatus.UNSUPPORTED:
                                    entry = library.get_entry_full_by_path(rel_p)
                                    if entry is not None:
                                        try:
                                            tag_entries_with_system_tag(
                                                library, entry.id, TAG_SYSTEM_UNSUPPORTED
                                            )
                                        except Exception as exc:
                                            logger.warning(
                                                "tag_unsupported.failed",
                                                path=str(rel_p),
                                                error=str(exc),
                                            )

                    if candidate_paths:
                        if remux_on_import == "auto" and ffmpeg_cmd:
                            self._emit(
                                job_id,
                                "job.progress",
                                status="running",
                                message=f"Auto-remuxing {len(candidate_paths)} new video(s)...",
                                progress_current=0,
                                progress_total=len(candidate_paths),
                            )
                            backup_dir = (
                                library_dir / TS_FOLDER_NAME / "remux_backups"
                                if remux_mode == "backup"
                                else None
                            )
                            for idx, rel_p in enumerate(candidate_paths, 1):
                                full_p = library_dir / rel_p
                                entry = library.get_entry_full_by_path(rel_p)
                                try:
                                    new_p = remux_to_mp4(
                                        full_p,
                                        ffmpeg_cmd,
                                        backup_dir=backup_dir,
                                        library_dir=library_dir,
                                    )
                                    if entry is not None:
                                        if new_p != full_p:
                                            new_rel = new_p.relative_to(library_dir)
                                            library.update_entry_path(entry.id, new_rel)
                                        tag_entries_with_system_tag(
                                            library, entry.id, TAG_SYSTEM_REMUXED
                                        )
                                except Exception as err:
                                    logger.warning(
                                        "auto_remux.failed", path=str(full_p), error=str(err)
                                    )

                                self._emit(
                                    job_id,
                                    "job.progress",
                                    status="running",
                                    message=(
                                        f"Auto-remuxing videos ({idx}/{len(candidate_paths)})..."
                                    ),
                                    progress_current=idx,
                                    progress_total=len(candidate_paths),
                                )
                        elif remux_on_import == "ask":
                            remux_candidates_count = len(candidate_paths)

            self._emit(
                job_id,
                "job.completed",
                status="completed",
                message=f"Refresh completed. Scanned {scanned_count} files, "
                f"added {to_save} new entries.",
                progress_current=to_save,
                progress_total=to_save,
                remux_candidates_count=remux_candidates_count,
            )
        except Exception as exc:
            logger.exception("Refresh job failed.", job_id=job_id, error=str(exc))
            self._emit(
                job_id,
                "job.failed",
                status="failed",
                message="Refresh failed.",
                error=str(exc),
            )

    def _run_remux(self, job_id: str, library: Library, mode: str) -> None:
        self._emit(
            job_id,
            "job.started",
            status="running",
            message="Starting video remux scan...",
            progress_current=0,
            progress_total=None,
        )

        try:
            library_dir = library.library_dir
            if library_dir is None:
                raise ValueError("No library open.")

            ffprobe_cmd = find_ffprobe()
            ffmpeg_cmd = find_ffmpeg()
            if not ffprobe_cmd or not ffmpeg_cmd:
                raise RuntimeError(
                    "FFmpeg and FFprobe are required for remuxing but were not found."
                )

            self._emit(
                job_id,
                "job.progress",
                status="running",
                message="Scanning library entries for incompatible video files...",
                progress_current=0,
                progress_total=None,
            )

            candidates: list[tuple[int, Path, Path]] = []  # (entry_id, full_path, rel_path)
            for entry in library.all_entries():
                suffix = entry.path.suffix.lower().lstrip(".")
                if suffix in VIDEO_EXTENSIONS:
                    full_p = library_dir / entry.path
                    if full_p.is_file():
                        inspection = inspect_video(full_p, ffprobe_cmd)
                        if inspection == VideoInspectionStatus.REMUXABLE:
                            candidates.append((entry.id, full_p, entry.path))
                        elif inspection == VideoInspectionStatus.CORRUPTED:
                            try:
                                tag_entries_with_system_tag(library, entry.id, TAG_SYSTEM_CORRUPTED)
                            except Exception as exc:
                                logger.warning(
                                    "tag_corrupted.failed", path=str(full_p), error=str(exc)
                                )
                        elif inspection == VideoInspectionStatus.UNSUPPORTED:
                            try:
                                tag_entries_with_system_tag(
                                    library, entry.id, TAG_SYSTEM_UNSUPPORTED
                                )
                            except Exception as exc:
                                logger.warning(
                                    "tag_unsupported.failed", path=str(full_p), error=str(exc)
                                )

            total_candidates = len(candidates)
            if total_candidates == 0:
                self._emit(
                    job_id,
                    "job.completed",
                    status="completed",
                    message="Scan complete. No videos need remuxing.",
                    progress_current=0,
                    progress_total=0,
                )
                return

            backup_dir = (
                library_dir / TS_FOLDER_NAME / "remux_backups" if mode == "backup" else None
            )

            self._emit(
                job_id,
                "job.progress",
                status="running",
                message=f"Found {total_candidates} video(s) to remux. Starting...",
                progress_current=0,
                progress_total=total_candidates,
            )

            successful_count = 0
            for idx, (entry_id, full_p, _rel_p) in enumerate(candidates, 1):
                self._emit(
                    job_id,
                    "job.progress",
                    status="running",
                    message=f"Remuxing {full_p.name} ({idx}/{total_candidates})...",
                    progress_current=idx - 1,
                    progress_total=total_candidates,
                )

                try:
                    new_p = remux_to_mp4(
                        full_p,
                        ffmpeg_cmd,
                        backup_dir=backup_dir,
                        library_dir=library_dir,
                    )
                    if new_p != full_p:
                        new_rel = new_p.relative_to(library_dir)
                        library.update_entry_path(entry_id, new_rel)
                    tag_entries_with_system_tag(library, entry_id, TAG_SYSTEM_REMUXED)
                    successful_count += 1
                except Exception as exc:
                    logger.warning("remux.file_failed", path=str(full_p), error=str(exc))

                self._emit(
                    job_id,
                    "job.progress",
                    status="running",
                    message=f"Remuxing {full_p.name} ({idx}/{total_candidates})...",
                    progress_current=idx,
                    progress_total=total_candidates,
                )

            self._emit(
                job_id,
                "job.completed",
                status="completed",
                message=(
                    f"Remux completed. Successfully remuxed {successful_count} of "
                    f"{total_candidates} video(s)."
                ),
                progress_current=total_candidates,
                progress_total=total_candidates,
            )
        except Exception as exc:
            logger.exception("Remux job failed.", job_id=job_id, error=str(exc))
            self._emit(
                job_id,
                "job.failed",
                status="failed",
                message="Remux job failed.",
                error=str(exc),
            )

    def _emit(
        self,
        job_id: str,
        event_name: str,
        *,
        status: str,
        message: str | None = None,
        error: str | None = None,
        progress_current: int | None = None,
        progress_total: int | None = None,
        remux_candidates_count: int | None = None,
    ) -> None:
        with self._lock:
            job = self._jobs[job_id]
            job.status = status
            if message is not None:
                job.message = message
            if error is not None:
                job.error = error
            if progress_current is not None:
                job.progress_current = progress_current
            if progress_total is not None or progress_total is None:
                job.progress_total = progress_total
            if remux_candidates_count is not None:
                job.remux_candidates_count = remux_candidates_count

            payload = {
                **job.as_dict(),
                "timestamp": datetime.now(UTC).isoformat(),
            }
            event = (event_name, payload)
            job.events.append(event)
            for subscriber in job.subscribers:
                subscriber.put(event)

    def _format_sse(self, event_name: str, payload: dict) -> str:
        data = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
        return f"event: {event_name}\ndata: {data}\n\n"

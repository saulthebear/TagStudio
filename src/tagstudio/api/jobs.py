import json
import threading
from collections.abc import Generator
from dataclasses import dataclass, field
from datetime import UTC, datetime
from queue import Empty, Queue
from uuid import uuid4

import structlog

from tagstudio.core.library.alchemy.library import Library
from tagstudio.core.library.refresh import RefreshTracker

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
        }


class JobManager:
    """Thread-safe in-process background job manager with SSE event fanout."""

    def __init__(self):
        self._jobs: dict[str, JobRecord] = {}
        self._lock = threading.Lock()

    def start_refresh(self, library: Library) -> JobRecord:
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
            daemon=True,
            name=f"tagstudio-refresh-{job.id}",
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

    def _run_refresh(self, job_id: str, library: Library) -> None:
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

            self._emit(
                job_id,
                "job.completed",
                status="completed",
                message=f"Refresh completed. Scanned {scanned_count} files, "
                f"added {to_save} new entries.",
                progress_current=to_save,
                progress_total=to_save,
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

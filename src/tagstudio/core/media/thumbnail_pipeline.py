import hashlib
import io
import json
import mimetypes
import os
import platform
import shutil
import subprocess
import threading
from dataclasses import dataclass
from pathlib import Path
from queue import Empty, PriorityQueue
from typing import Literal

import structlog
from PIL import Image, ImageOps, UnidentifiedImageError
from PIL.Image import Resampling

from tagstudio.core.constants import THUMB_CACHE_NAME, TS_FOLDER_NAME

try:
    import cv2
except Exception:  # pragma: no cover - handled at runtime when optional deps are missing.
    cv2 = None

logger = structlog.get_logger(__name__)

ThumbnailFit = Literal["cover", "contain"]
ThumbnailKind = Literal["grid", "preview"]
ThumbnailPriority = Literal["foreground", "background"]


@dataclass(frozen=True)
class ThumbnailOptions:
    size: int
    fit: ThumbnailFit
    kind: ThumbnailKind


@dataclass(frozen=True)
class PrewarmResult:
    accepted: int
    skipped: int


@dataclass(frozen=True)
class _QueuedTask:
    key: str
    entry_path: Path
    options: ThumbnailOptions


class ThumbnailPipelineError(Exception):
    """Base exception for thumbnail pipeline failures."""


class ThumbnailUnsupportedError(ThumbnailPipelineError):
    """Raised when a file cannot be thumbnailed with available dependencies."""


class ThumbnailPipeline:
    VERSION = "v1"
    MIN_SIZE = 32
    MAX_SIZE = 2048
    MIN_QUALITY = 1
    MAX_QUALITY = 100
    MIN_CACHE_MIB = 64
    MAX_CACHE_MIB = 16384

    _IMAGE_SUFFIXES = {
        ".jpg",
        ".jpeg",
        ".png",
        ".gif",
        ".webp",
        ".bmp",
        ".tif",
        ".tiff",
        ".jxl",
        ".heic",
        ".avif",
    }
    _VIDEO_SUFFIXES = {
        ".mp4",
        ".mov",
        ".mkv",
        ".webm",
        ".avi",
        ".m4v",
    }
    _FFMPEG_MACOS_LOCATIONS = (
        "",
        "/opt/homebrew/bin/",
        "/usr/local/bin/",
    )

    def __init__(
        self,
        library_dir: Path,
        *,
        cache_max_mib: int = 512,
        grid_size: int = 256,
        preview_size: int = 768,
        quality: int = 80,
        worker_count: int = 1,
    ) -> None:
        self.library_dir = library_dir.resolve()
        self.cache_root = (
            self.library_dir / TS_FOLDER_NAME / THUMB_CACHE_NAME / "web" / self.VERSION
        )
        self.cache_root.mkdir(parents=True, exist_ok=True)

        self._config_lock = threading.RLock()
        self._cache_max_bytes = 0
        self._grid_size = grid_size
        self._preview_size = preview_size
        self._quality = quality
        self._ffmpeg_cmd = self._find_tool("ffmpeg")
        self._ffprobe_cmd = self._find_tool("ffprobe")
        self.update_config(
            cache_max_mib=cache_max_mib,
            grid_size=grid_size,
            preview_size=preview_size,
            quality=quality,
        )

        self._key_locks: dict[str, threading.Lock] = {}
        self._key_locks_lock = threading.Lock()

        self._queue: PriorityQueue[tuple[int, int, _QueuedTask]] = PriorityQueue()
        self._queue_keys: set[str] = set()
        self._queue_lock = threading.Lock()
        self._queue_counter = 0

        self._stop_event = threading.Event()
        self._workers: list[threading.Thread] = []
        for index in range(max(1, worker_count)):
            worker = threading.Thread(
                target=self._worker_loop,
                daemon=True,
                name=f"tagstudio-thumbnail-prewarm-{index}",
            )
            worker.start()
            self._workers.append(worker)

    def close(self) -> None:
        self._stop_event.set()
        for worker in self._workers:
            worker.join(timeout=1.0)
        self._workers.clear()

    def update_config(
        self,
        *,
        cache_max_mib: int | None = None,
        grid_size: int | None = None,
        preview_size: int | None = None,
        quality: int | None = None,
    ) -> None:
        with self._config_lock:
            if cache_max_mib is not None:
                bounded_cache = max(self.MIN_CACHE_MIB, min(self.MAX_CACHE_MIB, int(cache_max_mib)))
                self._cache_max_bytes = bounded_cache * 1024 * 1024
            if grid_size is not None:
                self._grid_size = max(self.MIN_SIZE, min(self.MAX_SIZE, int(grid_size)))
            if preview_size is not None:
                self._preview_size = max(self.MIN_SIZE, min(self.MAX_SIZE, int(preview_size)))
            if quality is not None:
                self._quality = max(self.MIN_QUALITY, min(self.MAX_QUALITY, int(quality)))

    def get_default_size(self, kind: ThumbnailKind) -> int:
        with self._config_lock:
            return self._grid_size if kind == "grid" else self._preview_size

    def get_or_create(
        self,
        entry_path: Path,
        *,
        size: int | None = None,
        fit: ThumbnailFit = "cover",
        kind: ThumbnailKind = "grid",
    ) -> Path:
        entry_path = entry_path.resolve()
        if not entry_path.exists() or not entry_path.is_file():
            raise FileNotFoundError(entry_path)

        options = self._resolve_options(size=size, fit=fit, kind=kind)
        key, relative_path = self._cache_location(entry_path, options)
        cache_path = self.cache_root / relative_path

        if cache_path.exists():
            self._touch(cache_path)
            return cache_path

        key_lock = self._get_key_lock(key)
        with key_lock:
            if cache_path.exists():
                self._touch(cache_path)
                return cache_path

            image = self._render_thumbnail(entry_path, options)
            if image is None:
                raise ThumbnailUnsupportedError(f"Unsupported thumbnail input: {entry_path}")

            self._save_webp(cache_path, image)
            self._evict_if_needed()
            return cache_path

    def enqueue_prewarm(
        self,
        entry_paths: list[Path],
        *,
        size: int | None = None,
        fit: ThumbnailFit = "cover",
        kind: ThumbnailKind = "grid",
        priority: ThumbnailPriority = "background",
    ) -> PrewarmResult:
        options = self._resolve_options(size=size, fit=fit, kind=kind)

        accepted = 0
        skipped = 0
        for raw_path in entry_paths:
            entry_path = raw_path.resolve()
            if not entry_path.exists() or not entry_path.is_file():
                skipped += 1
                continue

            key, relative_path = self._cache_location(entry_path, options)
            cache_path = self.cache_root / relative_path
            if cache_path.exists():
                skipped += 1
                continue

            with self._queue_lock:
                if key in self._queue_keys:
                    skipped += 1
                    continue

                self._queue_counter += 1
                self._queue_keys.add(key)
                task = _QueuedTask(key=key, entry_path=entry_path, options=options)
                self._queue.put((self._priority_value(priority), self._queue_counter, task))
                accepted += 1

        return PrewarmResult(accepted=accepted, skipped=skipped)

    def _worker_loop(self) -> None:
        while not self._stop_event.is_set():
            try:
                _, _, task = self._queue.get(timeout=0.25)
            except Empty:
                continue

            try:
                self.get_or_create(
                    task.entry_path,
                    size=task.options.size,
                    fit=task.options.fit,
                    kind=task.options.kind,
                )
            except ThumbnailUnsupportedError:
                # Unsupported/corrupt files are expected for some libraries.
                pass
            except Exception as exc:
                logger.debug(
                    "Thumbnail prewarm skipped.",
                    path=str(task.entry_path),
                    error=str(exc),
                )
            finally:
                with self._queue_lock:
                    self._queue_keys.discard(task.key)
                self._queue.task_done()

    def _resolve_options(
        self,
        *,
        size: int | None,
        fit: ThumbnailFit,
        kind: ThumbnailKind,
    ) -> ThumbnailOptions:
        normalized_kind: ThumbnailKind = "preview" if kind == "preview" else "grid"
        normalized_fit: ThumbnailFit = "contain" if fit == "contain" else "cover"
        normalized_size = (
            max(self.MIN_SIZE, min(self.MAX_SIZE, int(size)))
            if size is not None
            else self.get_default_size(normalized_kind)
        )
        return ThumbnailOptions(size=normalized_size, fit=normalized_fit, kind=normalized_kind)

    def _priority_value(self, priority: ThumbnailPriority) -> int:
        return 0 if priority == "foreground" else 10

    def _cache_location(self, entry_path: Path, options: ThumbnailOptions) -> tuple[str, Path]:
        stat = entry_path.stat()
        payload = {
            "path": str(entry_path),
            "mtime_ns": stat.st_mtime_ns,
            "file_size": stat.st_size,
            "size": options.size,
            "fit": options.fit,
            "kind": options.kind,
            "version": self.VERSION,
        }
        encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
        digest = hashlib.sha256(encoded).hexdigest()
        return digest, Path(digest[:2]) / f"{digest}.webp"

    def _get_key_lock(self, key: str) -> threading.Lock:
        with self._key_locks_lock:
            lock = self._key_locks.get(key)
            if lock is None:
                lock = threading.Lock()
                self._key_locks[key] = lock
            return lock

    def _touch(self, path: Path) -> None:
        try:
            os.utime(path, None)
        except OSError:
            logger.debug("Unable to touch thumbnail cache file.", path=str(path))

    def _save_webp(self, target: Path, image: Image.Image) -> None:
        target.parent.mkdir(parents=True, exist_ok=True)
        if image.mode not in {"RGB", "RGBA"}:
            image = image.convert("RGBA" if "A" in image.getbands() else "RGB")

        tmp_path = target.with_suffix(f".tmp-{threading.get_ident()}.webp")
        image.save(tmp_path, format="WEBP", quality=self._quality, method=6)
        tmp_path.replace(target)

    def _evict_if_needed(self) -> None:
        with self._config_lock:
            max_bytes = self._cache_max_bytes

        files = [
            cache_file
            for cache_file in self.cache_root.rglob("*.webp")
            if cache_file.is_file()
        ]
        if not files:
            return

        total_bytes = sum(cache_file.stat().st_size for cache_file in files)
        if total_bytes <= max_bytes:
            return

        files.sort(key=lambda item: item.stat().st_mtime)
        for cache_file in files:
            if total_bytes <= max_bytes:
                break

            size = cache_file.stat().st_size
            try:
                cache_file.unlink(missing_ok=True)
                total_bytes -= size
            except OSError:
                logger.debug("Unable to evict cache file.", path=str(cache_file))

    def _render_thumbnail(self, entry_path: Path, options: ThumbnailOptions) -> Image.Image | None:
        media_type, _ = mimetypes.guess_type(str(entry_path))
        suffix = entry_path.suffix.lower()

        if (media_type or "").startswith("image/") or suffix in self._IMAGE_SUFFIXES:
            return self._render_image(entry_path, options)

        if (media_type or "").startswith("video/") or suffix in self._VIDEO_SUFFIXES:
            return self._render_video(entry_path, options)

        return None

    def _render_image(self, entry_path: Path, options: ThumbnailOptions) -> Image.Image | None:
        try:
            with Image.open(entry_path) as source:
                image = ImageOps.exif_transpose(source)
                image.load()
            return self._fit_image(image, options)
        except (UnidentifiedImageError, OSError, ValueError):
            return None

    def _render_video(self, entry_path: Path, options: ThumbnailOptions) -> Image.Image | None:
        image = self._render_video_with_opencv(entry_path, options)
        if image is not None:
            return image

        return self._render_video_with_ffmpeg(entry_path, options)

    def _render_video_with_opencv(
        self, entry_path: Path, options: ThumbnailOptions
    ) -> Image.Image | None:
        if cv2 is None:
            return None

        capture = cv2.VideoCapture(str(entry_path))
        if not capture.isOpened():
            capture.release()
            return None
        try:
            frame = self._extract_video_frame(capture)
        except Exception:
            frame = None
        finally:
            capture.release()

        if frame is None:
            return None

        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        image = Image.fromarray(rgb_frame, mode="RGB")
        return self._fit_image(image, options)

    def _render_video_with_ffmpeg(
        self, entry_path: Path, options: ThumbnailOptions
    ) -> Image.Image | None:
        if self._ffmpeg_cmd is None:
            return None

        duration = self._probe_duration_seconds(entry_path)
        candidate_offsets = self._build_candidate_offsets(duration)

        for offset in candidate_offsets:
            image = self._extract_video_frame_with_ffmpeg(entry_path, offset)
            if image is not None:
                return self._fit_image(image, options)

        return None

    def _extract_video_frame(self, capture):  # type: ignore[no-untyped-def]
        frame_count = float(capture.get(cv2.CAP_PROP_FRAME_COUNT))
        fps = float(capture.get(cv2.CAP_PROP_FPS))

        duration: float | None = None
        if frame_count > 0 and fps > 0:
            duration = frame_count / fps

        for offset in self._build_candidate_offsets(duration):
            frame = self._read_frame_at(capture, offset)
            if frame is not None:
                return frame

        capture.set(cv2.CAP_PROP_POS_FRAMES, 0)
        for _ in range(10):
            success, frame = capture.read()
            if success and frame is not None:
                return frame

        return None

    def _read_frame_at(self, capture, seconds: float):  # type: ignore[no-untyped-def]
        capture.set(cv2.CAP_PROP_POS_MSEC, max(0.0, seconds) * 1000.0)
        success, frame = capture.read()
        if not success:
            return None
        return frame

    def _extract_video_frame_with_ffmpeg(self, entry_path: Path, seconds: float) -> Image.Image | None:
        if self._ffmpeg_cmd is None:
            return None

        normalized_seconds = max(0.0, seconds)
        ffmpeg_prefix = [
            self._ffmpeg_cmd,
            "-hide_banner",
            "-loglevel",
            "error",
        ]
        ffmpeg_suffix = [
            "-frames:v",
            "1",
            "-f",
            "image2pipe",
            "-vcodec",
            "png",
            "pipe:1",
        ]

        commands: list[list[str]] = [
            [*ffmpeg_prefix, "-ss", f"{normalized_seconds:.3f}", "-i", str(entry_path), *ffmpeg_suffix],
            [*ffmpeg_prefix, "-i", str(entry_path), "-ss", f"{normalized_seconds:.3f}", *ffmpeg_suffix],
            [*ffmpeg_prefix, "-i", str(entry_path), *ffmpeg_suffix],
        ]

        seen_commands: set[tuple[str, ...]] = set()
        for cmd in commands:
            signature = tuple(cmd)
            if signature in seen_commands:
                continue
            seen_commands.add(signature)

            try:
                result = subprocess.run(  # noqa: S603
                    cmd,
                    check=False,
                    capture_output=True,
                )
            except OSError:
                continue

            if result.returncode != 0 or not result.stdout:
                continue

            try:
                with Image.open(io.BytesIO(result.stdout)) as source:
                    return source.copy()
            except (UnidentifiedImageError, OSError, ValueError):
                continue
        return None

    def _probe_duration_seconds(self, entry_path: Path) -> float | None:
        if self._ffprobe_cmd is None:
            return None

        cmd = [
            self._ffprobe_cmd,
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "json",
            str(entry_path),
        ]
        try:
            result = subprocess.run(  # noqa: S603
                cmd,
                check=False,
                capture_output=True,
                text=True,
            )
        except OSError:
            return None

        if result.returncode != 0 or not result.stdout:
            return None

        try:
            payload = json.loads(result.stdout)
            raw_duration = payload.get("format", {}).get("duration")
            if raw_duration is None:
                return None
            duration = float(raw_duration)
            if duration <= 0:
                return None
            return duration
        except (ValueError, TypeError, json.JSONDecodeError):
            return None

    def _build_candidate_offsets(self, duration: float | None) -> list[float]:
        candidate_offsets: list[float] = []
        if duration and duration > 0:
            max_offset = max(duration - 0.01, 0.0)
            candidate_offsets.extend(
                [
                    min(max_offset, max(1.0, duration * 0.1)),
                    0.0,
                    min(max_offset, duration / 2.0),
                ]
            )
        else:
            candidate_offsets.extend([1.0, 0.0])

        unique_offsets: list[float] = []
        seen: set[int] = set()
        for offset in candidate_offsets:
            marker = int(offset * 1000)
            if marker in seen:
                continue
            seen.add(marker)
            unique_offsets.append(offset)
        return unique_offsets

    def _find_tool(self, name: str) -> str | None:
        command = shutil.which(name)
        if command is not None:
            return command

        if platform.system() != "Darwin":
            return None

        for prefix in self._FFMPEG_MACOS_LOCATIONS:
            candidate = shutil.which(f"{prefix}{name}")
            if candidate is not None:
                return candidate
        return None

    def _fit_image(self, image: Image.Image, options: ThumbnailOptions) -> Image.Image:
        target = (options.size, options.size)
        if options.fit == "cover":
            return ImageOps.fit(image, target, method=Resampling.LANCZOS)

        contained = ImageOps.contain(image, target, method=Resampling.LANCZOS)
        has_alpha = "A" in contained.getbands()
        mode = "RGBA" if has_alpha else "RGB"
        background = (0, 0, 0, 0) if has_alpha else (15, 23, 42)
        canvas = Image.new(mode, target, background)
        offset = (
            (target[0] - contained.size[0]) // 2,
            (target[1] - contained.size[1]) // 2,
        )
        canvas.paste(contained, offset, contained if has_alpha else None)
        return canvas

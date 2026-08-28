# Copyright (C) 2025
# Licensed under the GPL-3.0 License.
# Created for TagStudio: https://github.com/CyanVoxel/TagStudio

"""Utilities for remuxing video files into browser-compatible MP4 containers.

The module provides functions to detect whether a video file needs remuxing
(i.e. its container format is not natively playable by browsers despite
containing browser-compatible codecs) and to perform a lossless remux using
FFmpeg.
"""

import contextlib
import json
import os
import shutil
import subprocess
from enum import Enum
from pathlib import Path

import structlog

logger = structlog.get_logger(__name__)

# Container format tokens reported by ffprobe that browsers can play natively.
BROWSER_NATIVE_CONTAINER_TOKENS: set[str] = {
    "mov",
    "mp4",
    "m4a",
    "m4v",
    "3gp",
    "3g2",
    "mj2",
    "quicktime",
}

# Video codecs that browsers can decode.
BROWSER_COMPATIBLE_VIDEO_CODECS: set[str] = {
    "h264",
    "hevc",
    "h265",
    "vp8",
    "vp9",
    "av1",
}

# Audio codecs that browsers can decode.
BROWSER_COMPATIBLE_AUDIO_CODECS: set[str] = {
    "aac",
    "mp3",
    "opus",
    "vorbis",
    "flac",
    "pcm_s16le",
    "pcm_f32le",
}

# File extensions considered video files for scanning purposes.
VIDEO_EXTENSIONS: set[str] = {"mp4", "mov", "mkv", "webm", "avi", "m4v", "ts", "mts", "m2ts"}

_SEARCH_PATHS: tuple[str, ...] = (
    "",
    "/opt/homebrew/bin/",
    "/usr/local/bin/",
)


def _find_tool(name: str) -> str | None:
    found = shutil.which(name)
    if found:
        return found
    for prefix in _SEARCH_PATHS:
        candidate = f"{prefix}{name}"
        if shutil.which(candidate):
            return candidate
        if Path(candidate).is_file() and os.access(candidate, os.X_OK):
            return candidate
    return None


def find_ffmpeg() -> str | None:
    return _find_tool("ffmpeg")


def find_ffprobe() -> str | None:
    return _find_tool("ffprobe")


def is_browser_native_container(format_name: str) -> bool:
    """Return True if the container format string corresponds to MP4/MOV container."""
    if not format_name:
        return False
    tokens = {tok.strip().lower() for tok in format_name.split(",")}
    return bool(tokens & BROWSER_NATIVE_CONTAINER_TOKENS)


def _run_ffprobe(path: Path, ffprobe_cmd: str, timeout: float = 30.0) -> dict | None:
    """Run ffprobe and return parsed JSON output, or None on failure."""
    cmd = [
        ffprobe_cmd,
        "-v",
        "error",
        "-show_entries",
        "format=format_name:stream=codec_name,codec_type,disposition",
        "-of",
        "json",
        str(path),
    ]
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        if result.returncode != 0:
            logger.warning("ffprobe failed", path=str(path), stderr=result.stderr.strip())
            return None
        return json.loads(result.stdout)
    except subprocess.TimeoutExpired:
        logger.warning("ffprobe timed out", path=str(path))
        return None
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("ffprobe error", path=str(path), error=str(exc))
        return None


class VideoInspectionStatus(str, Enum):
    NATIVE = "native"
    REMUXABLE = "remuxable"
    CORRUPTED = "corrupted"
    UNSUPPORTED = "unsupported"


def inspect_video(path: Path, ffprobe_cmd: str) -> VideoInspectionStatus:
    """Inspect a video file and return its playback/remux capability status."""
    probe = _run_ffprobe(path, ffprobe_cmd)
    if probe is None:
        return VideoInspectionStatus.CORRUPTED

    streams = probe.get("streams", [])
    if not streams:
        return VideoInspectionStatus.CORRUPTED

    format_name = probe.get("format", {}).get("format_name", "")
    is_native_container = is_browser_native_container(format_name)

    # Separate primary video streams and audio streams, ignoring attached cover art
    video_streams: list[dict] = []
    audio_streams: list[dict] = []
    for s in streams:
        codec_type = s.get("codec_type")
        disposition = s.get("disposition", {}) or {}
        is_attached_pic = bool(disposition.get("attached_pic", 0))
        if codec_type == "video":
            if not is_attached_pic:
                video_streams.append(s)
        elif codec_type == "audio":
            audio_streams.append(s)

    if not video_streams:
        return VideoInspectionStatus.CORRUPTED

    if is_native_container:
        return VideoInspectionStatus.NATIVE

    for s in video_streams:
        codec_name = str(s.get("codec_name", "")).lower()
        if codec_name not in BROWSER_COMPATIBLE_VIDEO_CODECS:
            return VideoInspectionStatus.UNSUPPORTED

    for s in audio_streams:
        codec_name = str(s.get("codec_name", "")).lower()
        if codec_name not in BROWSER_COMPATIBLE_AUDIO_CODECS:
            return VideoInspectionStatus.UNSUPPORTED

    return VideoInspectionStatus.REMUXABLE


def needs_remux(path: Path, ffprobe_cmd: str) -> bool:
    """Check whether a video file needs remuxing for browser playback.

    Returns True if the file's container is not browser-native but its
    video/audio codecs are browser-compatible (meaning a lossless remux
    into MP4 would make it playable).
    """
    return inspect_video(path, ffprobe_cmd) == VideoInspectionStatus.REMUXABLE


def remux_to_mp4(
    path: Path,
    ffmpeg_cmd: str,
    *,
    backup_dir: Path | None = None,
    library_dir: Path | None = None,
    timeout: float = 300.0,
) -> Path:
    """Remux a video file into a proper MP4 container.

    The operation is lossless — video and audio streams are copied without
    re-encoding.

    Args:
        path: Absolute path to the video file.
        ffmpeg_cmd: Path to the ffmpeg binary.
        backup_dir: If provided, the original file is moved here before
            replacement. The relative directory structure from library_dir
            is preserved inside backup_dir.
        library_dir: The library root, used to compute relative paths for
            backups. Required when backup_dir is set.
        timeout: Maximum seconds to wait for ffmpeg to complete.

    Returns:
        The path to the remuxed file. If the original had a non-.mp4
        extension, the returned path will have .mp4 extension.

    Raises:
        RuntimeError: If FFmpeg fails or times out.
        FileNotFoundError: If the input file does not exist.
    """
    if not path.is_file():
        raise FileNotFoundError(f"Video file not found: {path}")

    # Determine destination path.
    target_mp4_path = path.with_suffix(".mp4")
    # Temporary output file created alongside the target.
    temp_output_path = target_mp4_path.with_name(f".{target_mp4_path.stem}.remux.tmp.mp4")

    # Clean up any leftover temporary file from a prior failed attempt.
    if temp_output_path.exists():
        temp_output_path.unlink()

    cmd = [
        ffmpeg_cmd,
        "-y",
        "-i",
        str(path),
        "-c",
        "copy",
        "-movflags",
        "+faststart",
        str(temp_output_path),
    ]

    logger.info("remux.start", source=str(path), target=str(target_mp4_path))
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        if result.returncode != 0:
            if temp_output_path.exists():
                temp_output_path.unlink()
            raise RuntimeError(
                f"FFmpeg remux failed (exit code {result.returncode}): {result.stderr.strip()}"
            )
    except subprocess.TimeoutExpired as exc:
        if temp_output_path.exists():
            temp_output_path.unlink()
        raise RuntimeError(f"FFmpeg remux timed out after {timeout}s: {path}") from exc

    # If backup mode is requested, move original to backup_dir before replacing.
    if backup_dir is not None:
        if library_dir is None:
            raise ValueError("library_dir must be provided when backup_dir is specified.")
        try:
            rel_path = path.relative_to(library_dir)
        except ValueError:
            rel_path = Path(path.name)

        backup_file_path = backup_dir / rel_path
        backup_file_path.parent.mkdir(parents=True, exist_ok=True)
        # Move original to backup location
        shutil.move(str(path), str(backup_file_path))
        logger.info("remux.backup_created", original=str(path), backup=str(backup_file_path))
    else:
        # If target has a different extension and we aren't backing up, remove old file.
        if target_mp4_path != path and path.exists():
            path.unlink()

    # Move temp remux output into final location.
    shutil.move(str(temp_output_path), str(target_mp4_path))
    logger.info("remux.complete", target=str(target_mp4_path))

    return target_mp4_path


def get_backup_size(backup_dir: Path) -> tuple[int, int]:
    """Calculate the total bytes and file count of remux backups.

    Returns (total_bytes, file_count).
    """
    if not backup_dir.exists():
        return 0, 0

    total_bytes = 0
    file_count = 0
    for file_path in backup_dir.rglob("*"):
        if file_path.is_file():
            try:
                total_bytes += file_path.stat().st_size
                file_count += 1
            except OSError:
                pass
    return total_bytes, file_count


def purge_backups(backup_dir: Path) -> int:
    """Delete all files in the remux backup directory.

    Returns the number of files deleted.
    """
    if not backup_dir.exists():
        return 0

    deleted_count = 0
    for item in list(backup_dir.rglob("*")):
        if item.is_file():
            try:
                item.unlink()
                deleted_count += 1
            except OSError as err:
                logger.warning("purge_backups.unlink_failed", path=str(item), error=str(err))

    # Clean up empty directories
    for dirpath, _dirnames, _filenames in os.walk(backup_dir, topdown=False):
        with contextlib.suppress(OSError):
            os.rmdir(dirpath)

    return deleted_count

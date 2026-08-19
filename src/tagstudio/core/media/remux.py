# Copyright (C) 2025
# Licensed under the GPL-3.0 License.
# Created for TagStudio: https://github.com/CyanVoxel/TagStudio

"""Utilities for remuxing video files into browser-compatible MP4 containers.

The module provides functions to detect whether a video file needs remuxing
(i.e. its container format is not natively playable by browsers despite
containing browser-compatible codecs) and to perform a lossless remux using
FFmpeg.
"""

import json
import os
import shutil
import subprocess
from pathlib import Path

import structlog

logger = structlog.get_logger(__name__)

# Container format names reported by ffprobe that browsers can play natively.
# "mov,mp4,m4a,m4v,3gp,3g2,mj2" is how ffprobe identifies the MP4/MOV family.
BROWSER_NATIVE_CONTAINERS: set[str] = {
    "mov,mp4,m4a,m4v,3gp,3g2,mj2",
}

# Video codecs that browsers can decode.
BROWSER_COMPATIBLE_VIDEO_CODECS: set[str] = {
    "h264",
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



def _run_ffprobe(path: Path, ffprobe_cmd: str, timeout: float = 30.0) -> dict | None:
    """Run ffprobe and return parsed JSON output, or None on failure."""
    cmd = [
        ffprobe_cmd,
        "-v", "error",
        "-show_entries", "format=format_name:stream=codec_name,codec_type",
        "-of", "json",
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


from enum import Enum


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
    if format_name in BROWSER_NATIVE_CONTAINERS:
        return VideoInspectionStatus.NATIVE

    has_video = False
    for stream in streams:
        codec_name = stream.get("codec_name", "")
        codec_type = stream.get("codec_type", "")

        if codec_type == "video":
            has_video = True
            if codec_name not in BROWSER_COMPATIBLE_VIDEO_CODECS:
                return VideoInspectionStatus.UNSUPPORTED
        elif codec_type == "audio":
            if codec_name not in BROWSER_COMPATIBLE_AUDIO_CODECS:
                return VideoInspectionStatus.UNSUPPORTED

    if not has_video:
        return VideoInspectionStatus.CORRUPTED

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
        subprocess.CalledProcessError: If ffmpeg exits with a non-zero code.
        subprocess.TimeoutExpired: If ffmpeg exceeds the timeout.
        OSError: If file operations (move/rename) fail.
    """
    # Determine output path — always .mp4
    if path.suffix.lower() != ".mp4":
        final_path = path.with_suffix(".mp4")
    else:
        final_path = path

    # Use a temp file next to the original to avoid partial writes.
    tmp_path = path.with_name(path.stem + ".remux.tmp.mp4")

    try:
        cmd = [
            ffmpeg_cmd,
            "-y",                   # Overwrite output without asking
            "-i", str(path),
            "-c", "copy",           # Copy all streams without re-encoding
            "-movflags", "+faststart",  # Move moov atom to start for streaming
            str(tmp_path),
        ]

        logger.info("remux.start", src=str(path), dst=str(final_path))
        subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=True,
        )

        # Back up original if requested.
        if backup_dir is not None:
            if library_dir is None:
                raise ValueError("library_dir is required when backup_dir is set")

            try:
                rel = path.relative_to(library_dir)
            except ValueError:
                rel = Path(path.name)

            backup_path = backup_dir / rel
            backup_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(path), str(backup_path))
            logger.info("remux.backup", original=str(path), backup=str(backup_path))
        else:
            # Remove the original (we already have the remuxed copy).
            if path != final_path:
                path.unlink()
            # If same path, we'll overwrite below via rename.

        # Move temp file to final location.
        if final_path.exists() and final_path != path:
            # Edge case: a file with the .mp4 name already exists.
            final_path.unlink()
        elif path == final_path and backup_dir is None:
            # Original was .mp4 and no backup — remove before rename.
            path.unlink()

        shutil.move(str(tmp_path), str(final_path))
        logger.info("remux.complete", path=str(final_path))
        return final_path

    except Exception:
        # Clean up temp file on any failure.
        if tmp_path.exists():
            try:
                tmp_path.unlink()
            except OSError:
                pass
        raise


def get_backup_size(backup_dir: Path) -> tuple[int, int]:
    """Return (total_bytes, file_count) for all files in the backup directory.

    Returns (0, 0) if the directory doesn't exist.
    """
    if not backup_dir.exists():
        return 0, 0

    total_bytes = 0
    file_count = 0
    for root, _dirs, files in os.walk(backup_dir):
        for f in files:
            fp = Path(root) / f
            try:
                total_bytes += fp.stat().st_size
                file_count += 1
            except OSError:
                pass
    return total_bytes, file_count


def purge_backups(backup_dir: Path) -> int:
    """Delete all backup files and empty directories.

    Returns the number of files deleted.
    """
    if not backup_dir.exists():
        return 0

    count = 0
    for root, _dirs, files in os.walk(backup_dir, topdown=False):
        for f in files:
            fp = Path(root) / f
            try:
                fp.unlink()
                count += 1
            except OSError as exc:
                logger.warning("purge_backups.unlink_failed", path=str(fp), error=str(exc))

    # Remove empty directories.
    try:
        shutil.rmtree(backup_dir)
    except OSError:
        pass

    logger.info("purge_backups.complete", files_deleted=count)
    return count

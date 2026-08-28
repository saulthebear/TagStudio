from pathlib import Path
from unittest.mock import MagicMock, patch

from tagstudio.core.media.remux import (
    VideoInspectionStatus,
    get_backup_size,
    inspect_video,
    needs_remux,
    purge_backups,
    remux_to_mp4,
)


def test_needs_remux_native_mp4() -> None:
    probe_output = {
        "format": {"format_name": "mov,mp4,m4a,m4v,3gp,3g2,mj2"},
        "streams": [
            {"codec_name": "h264", "codec_type": "video"},
            {"codec_name": "aac", "codec_type": "audio"},
        ],
    }
    with patch("tagstudio.core.media.remux._run_ffprobe", return_value=probe_output):
        assert inspect_video(Path("test.mp4"), "ffprobe") == VideoInspectionStatus.NATIVE
        assert needs_remux(Path("test.mp4"), "ffprobe") is False


def test_inspect_video_hevc_and_cover_art() -> None:
    # MP4 with HEVC and container format without m4v
    probe_output_hevc = {
        "format": {"format_name": "mov,mp4,m4a,3gp,3g2,mj2"},
        "streams": [
            {"codec_name": "hevc", "codec_type": "video"},
            {"codec_name": "aac", "codec_type": "audio"},
        ],
    }
    with patch("tagstudio.core.media.remux._run_ffprobe", return_value=probe_output_hevc):
        assert inspect_video(Path("test.mp4"), "ffprobe") == VideoInspectionStatus.NATIVE

    # MP4 with H264 and MJPEG attached cover art
    probe_output_cover_art = {
        "format": {"format_name": "mov,mp4,m4a,3gp,3g2,mj2"},
        "streams": [
            {"codec_name": "h264", "codec_type": "video"},
            {"codec_name": "aac", "codec_type": "audio"},
            {"codec_name": "mjpeg", "codec_type": "video", "disposition": {"attached_pic": 1}},
        ],
    }
    with patch("tagstudio.core.media.remux._run_ffprobe", return_value=probe_output_cover_art):
        assert inspect_video(Path("test.mp4"), "ffprobe") == VideoInspectionStatus.NATIVE


def test_inspect_video_unsupported_mpeg2() -> None:
    probe_output = {
        "format": {"format_name": "mpeg"},
        "streams": [
            {"codec_name": "mpeg2video", "codec_type": "video"},
        ],
    }
    with patch("tagstudio.core.media.remux._run_ffprobe", return_value=probe_output):
        assert inspect_video(Path("test.mp4"), "ffprobe") == VideoInspectionStatus.UNSUPPORTED


def test_needs_remux_mpegts_with_h264_aac() -> None:
    probe_output = {
        "format": {"format_name": "mpegts"},
        "streams": [
            {"codec_name": "h264", "codec_type": "video"},
            {"codec_name": "aac", "codec_type": "audio"},
        ],
    }
    with patch("tagstudio.core.media.remux._run_ffprobe", return_value=probe_output):
        assert needs_remux(Path("test.mp4"), "ffprobe") is True


def test_needs_remux_mkv_with_h264() -> None:
    probe_output = {
        "format": {"format_name": "matroska,webm"},
        "streams": [
            {"codec_name": "h264", "codec_type": "video"},
            {"codec_name": "aac", "codec_type": "audio"},
        ],
    }
    with patch("tagstudio.core.media.remux._run_ffprobe", return_value=probe_output):
        assert needs_remux(Path("test.mkv"), "ffprobe") is True


def test_needs_remux_incompatible_video_codec() -> None:
    probe_output = {
        "format": {"format_name": "mpegts"},
        "streams": [
            {"codec_name": "mpeg2video", "codec_type": "video"},
            {"codec_name": "mp2", "codec_type": "audio"},
        ],
    }
    with patch("tagstudio.core.media.remux._run_ffprobe", return_value=probe_output):
        assert needs_remux(Path("test.ts"), "ffprobe") is False


def test_needs_remux_incompatible_audio_codec() -> None:
    probe_output = {
        "format": {"format_name": "matroska,webm"},
        "streams": [
            {"codec_name": "h264", "codec_type": "video"},
            {"codec_name": "ac3", "codec_type": "audio"},
        ],
    }
    with patch("tagstudio.core.media.remux._run_ffprobe", return_value=probe_output):
        assert needs_remux(Path("test.mkv"), "ffprobe") is False


def test_needs_remux_probe_failure() -> None:
    with patch("tagstudio.core.media.remux._run_ffprobe", return_value=None):
        assert needs_remux(Path("test.mp4"), "ffprobe") is False


def test_remux_to_mp4_with_backup(tmp_path: Path) -> None:
    lib_dir = tmp_path / "library"
    lib_dir.mkdir()
    sub_dir = lib_dir / "videos"
    sub_dir.mkdir()
    input_file = sub_dir / "clip.mkv"
    input_file.write_bytes(b"dummy video content")

    backup_dir = lib_dir / ".TagStudio" / "remux_backups"

    def fake_ffmpeg(cmd: list[str], **kwargs: object) -> MagicMock:
        # Create output file (cmd[-1])
        out_p = Path(cmd[-1])
        out_p.write_bytes(b"remuxed mp4 content")
        return MagicMock(returncode=0)

    with patch("subprocess.run", side_effect=fake_ffmpeg):
        out_path = remux_to_mp4(
            input_file,
            "ffmpeg",
            backup_dir=backup_dir,
            library_dir=lib_dir,
        )

    expected_out = sub_dir / "clip.mp4"
    assert out_path == expected_out
    assert out_path.exists()
    assert out_path.read_bytes() == b"remuxed mp4 content"
    assert not input_file.exists()

    expected_backup = backup_dir / "videos" / "clip.mkv"
    assert expected_backup.exists()
    assert expected_backup.read_bytes() == b"dummy video content"


def test_remux_to_mp4_replace_mode(tmp_path: Path) -> None:
    lib_dir = tmp_path / "library"
    lib_dir.mkdir()
    input_file = lib_dir / "mislabeled.mp4"
    input_file.write_bytes(b"original mpegts content")

    def fake_ffmpeg(cmd: list[str], **kwargs: object) -> MagicMock:
        out_p = Path(cmd[-1])
        out_p.write_bytes(b"proper mp4 content")
        return MagicMock(returncode=0)

    with patch("subprocess.run", side_effect=fake_ffmpeg):
        out_path = remux_to_mp4(
            input_file,
            "ffmpeg",
            backup_dir=None,
            library_dir=lib_dir,
        )

    assert out_path == input_file
    assert out_path.exists()
    assert out_path.read_bytes() == b"proper mp4 content"


def test_backup_size_and_purge(tmp_path: Path) -> None:
    backup_dir = tmp_path / "remux_backups"
    (backup_dir / "folder").mkdir(parents=True)
    f1 = backup_dir / "file1.mp4"
    f2 = backup_dir / "folder" / "file2.mkv"
    f1.write_bytes(b"12345")
    f2.write_bytes(b"1234567")

    total_bytes, file_count = get_backup_size(backup_dir)
    assert total_bytes == 12
    assert file_count == 2

    deleted = purge_backups(backup_dir)
    assert deleted == 2
    assert not backup_dir.exists()

    # Calling on non-existent dir
    assert get_backup_size(backup_dir) == (0, 0)
    assert purge_backups(backup_dir) == 0

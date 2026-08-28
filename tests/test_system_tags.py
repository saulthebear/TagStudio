from pathlib import Path
from unittest.mock import patch

from sqlalchemy import select
from sqlalchemy.orm import Session

from tagstudio.core.library.alchemy.library import Library
from tagstudio.core.library.alchemy.models import Entry, Tag
from tagstudio.core.library.system_tags import (
    SYSTEM_CATEGORY_NAME,
    TAG_SYSTEM_CORRUPTED,
    TAG_SYSTEM_REMUXED,
    TAG_SYSTEM_UNSUPPORTED,
    ensure_system_tags,
    sync_retroactive_system_tags,
    tag_entries_with_system_tag,
)
from tagstudio.core.media.remux import VideoInspectionStatus
from tagstudio.core.utils.types import unwrap


def test_ensure_system_tags_creates_hierarchy(tmp_path: Path) -> None:
    lib_path = tmp_path / "lib"
    lib_path.mkdir(parents=True, exist_ok=True)
    lib = Library()
    status = lib.open_library(lib_path)
    assert status.success

    tags = ensure_system_tags(lib)
    assert SYSTEM_CATEGORY_NAME in tags
    assert TAG_SYSTEM_REMUXED in tags
    assert TAG_SYSTEM_CORRUPTED in tags
    assert TAG_SYSTEM_UNSUPPORTED in tags

    parent_tag = lib.get_tag(tags[SYSTEM_CATEGORY_NAME])
    assert parent_tag is not None
    assert parent_tag.name == "System"
    assert parent_tag.is_category is True

    remuxed_tag = lib.get_tag(tags[TAG_SYSTEM_REMUXED])
    assert remuxed_tag is not None
    assert remuxed_tag.name == "system:remuxed"
    assert remuxed_tag.color_namespace == "tagstudio-standard"
    assert remuxed_tag.color_slug == "blue"

    # Verify parent-child relationship
    with Session(lib.engine) as session:
        tag_db = session.scalar(select(Tag).where(Tag.name == "system:remuxed"))
        assert tag_db is not None
        parent_names = {p.name for p in tag_db.parent_tags}
        assert "System" in parent_names

    lib.close()


def test_tag_entries_with_system_tag(tmp_path: Path) -> None:
    lib_path = tmp_path / "lib"
    lib_path.mkdir(parents=True, exist_ok=True)
    lib = Library()
    status = lib.open_library(lib_path)
    assert status.success

    (lib_path / "video.mp4").write_bytes(b"dummy")
    folder = unwrap(lib.folder)
    entry = Entry(path=Path("video.mp4"), folder=folder, fields=lib.default_fields)
    assert lib.add_entries([entry])

    added = tag_entries_with_system_tag(lib, entry.id, TAG_SYSTEM_REMUXED)
    assert added >= 1

    entry_full = lib.get_entry_full(entry.id)
    assert entry_full is not None
    tag_names = {t.name for t in entry_full.tags}
    assert "system:remuxed" in tag_names

    lib.close()


def test_sync_retroactive_system_tags(tmp_path: Path) -> None:
    lib_path = tmp_path / "lib"
    lib_path.mkdir(parents=True, exist_ok=True)
    lib = Library()
    status = lib.open_library(lib_path)
    assert status.success

    (lib_path / "remuxed_clip.mp4").write_bytes(b"dummy mp4")
    (lib_path / "corrupted_clip.webm").write_bytes(b"broken webm")

    # Create fake backup in .TagStudio/remux_backups
    backup_dir = lib_path / ".TagStudio" / "remux_backups"
    backup_dir.mkdir(parents=True)
    (backup_dir / "remuxed_clip.mkv").write_bytes(b"original mkv")

    folder = unwrap(lib.folder)
    e1 = Entry(path=Path("remuxed_clip.mp4"), folder=folder, fields=lib.default_fields)
    e2 = Entry(path=Path("corrupted_clip.webm"), folder=folder, fields=lib.default_fields)
    assert lib.add_entries([e1, e2])

    def fake_inspect(path: Path, ffprobe: str) -> VideoInspectionStatus:
        if "corrupted" in path.name:
            return VideoInspectionStatus.CORRUPTED
        return VideoInspectionStatus.NATIVE

    with (
        patch("tagstudio.core.library.system_tags.find_ffprobe", return_value="ffprobe"),
        patch("tagstudio.core.library.system_tags.inspect_video", side_effect=fake_inspect),
    ):
        summary = sync_retroactive_system_tags(lib)

    assert summary["remuxed_tagged"] == 1
    assert summary["corrupted_tagged"] == 1

    e1_full = lib.get_entry_full(e1.id)
    assert e1_full is not None
    assert any(t.name == "system:remuxed" for t in e1_full.tags)

    e2_full = lib.get_entry_full(e2.id)
    assert e2_full is not None
    assert any(t.name == "system:corrupted" for t in e2_full.tags)

    lib.close()


def test_untagged_search_ignores_system_tags(tmp_path: Path) -> None:
    lib_path = tmp_path / "lib"
    lib_path.mkdir(parents=True, exist_ok=True)
    lib = Library()
    status = lib.open_library(lib_path)
    assert status.success

    folder = unwrap(lib.folder)
    e_no_tags = Entry(path=Path("no_tags.mp4"), folder=folder, fields=lib.default_fields)
    e_sys_only = Entry(path=Path("sys_only.mp4"), folder=folder, fields=lib.default_fields)
    e_user_tagged = Entry(path=Path("user_tagged.mp4"), folder=folder, fields=lib.default_fields)
    assert lib.add_entries([e_no_tags, e_sys_only, e_user_tagged])

    # Tag e_sys_only with system:remuxed
    tag_entries_with_system_tag(lib, e_sys_only.id, TAG_SYSTEM_REMUXED)

    # Create a user tag and tag e_user_tagged with both a user tag and system:remuxed
    user_tag = lib.add_tag(Tag(name="MyUserTag"))
    assert user_tag is not None
    lib.add_tags_to_entries([e_user_tagged.id], user_tag.id)
    tag_entries_with_system_tag(lib, e_user_tagged.id, TAG_SYSTEM_REMUXED)

    # Search for untagged entries
    from tagstudio.core.library.alchemy.enums import BrowsingState

    state = BrowsingState(query="special:untagged")
    res = lib.search_library(state, page_size=100)
    found_ids = set(res.ids)

    # e_no_tags and e_sys_only SHOULD be in untagged results
    assert e_no_tags.id in found_ids
    assert e_sys_only.id in found_ids
    # e_user_tagged SHOULD NOT be in untagged results
    assert e_user_tagged.id not in found_ids

    lib.close()

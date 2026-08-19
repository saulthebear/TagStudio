# Copyright (C) 2025
# Licensed under the GPL-3.0 License.
# Created for TagStudio: https://github.com/CyanVoxel/TagStudio

"""Management and synchronization of automated System tags in TagStudio.

System tags are organized under a parent category tag ('System') and are used
to track files processed by background operations (e.g. remuxing) or flagged
during probing (e.g. corrupted container headers).
"""

from collections.abc import Iterable
from pathlib import Path

import structlog

from tagstudio.core.constants import TS_FOLDER_NAME
from tagstudio.core.library.alchemy.library import Library
from tagstudio.core.library.alchemy.models import Tag
from tagstudio.core.media.remux import (
    VIDEO_EXTENSIONS,
    VideoInspectionStatus,
    find_ffprobe,
    inspect_video,
)

logger = structlog.get_logger(__name__)

SYSTEM_CATEGORY_NAME = "System"
TAG_SYSTEM_REMUXED = "system:remuxed"
TAG_SYSTEM_CORRUPTED = "system:corrupted"
TAG_SYSTEM_UNSUPPORTED = "system:unsupported"

SYSTEM_TAG_SPECS: dict[str, dict[str, str]] = {
    TAG_SYSTEM_REMUXED: {
        "color_namespace": "tagstudio-standard",
        "color_slug": "blue",
    },
    TAG_SYSTEM_CORRUPTED: {
        "color_namespace": "tagstudio-standard",
        "color_slug": "red",
    },
    TAG_SYSTEM_UNSUPPORTED: {
        "color_namespace": "tagstudio-standard",
        "color_slug": "orange",
    },
}


def ensure_system_tags(library: Library) -> dict[str, int]:
    """Ensure the parent 'System' category tag and all system child tags exist.

    Returns a mapping of tag name to tag ID.
    """
    tag_ids: dict[str, int] = {}

    # 1. Ensure parent category tag "System" exists.
    parent = library.get_tag_by_name(SYSTEM_CATEGORY_NAME)
    if parent is None:
        new_parent = Tag(
            name=SYSTEM_CATEGORY_NAME,
            is_category=True,
        )
        created_parent = library.add_tag(new_parent)
        if created_parent is None:
            raise RuntimeError(f"Failed to create parent tag {SYSTEM_CATEGORY_NAME}")
        parent_id = created_parent.id
    else:
        parent_id = parent.id

    tag_ids[SYSTEM_CATEGORY_NAME] = parent_id

    # 2. Ensure each child system tag exists under parent "System".
    for name, spec in SYSTEM_TAG_SPECS.items():
        existing = library.get_tag_by_name(name)
        if existing is None:
            new_tag = Tag(
                name=name,
                color_namespace=spec["color_namespace"],
                color_slug=spec["color_slug"],
                is_category=False,
            )
            created_tag = library.add_tag(new_tag, parent_ids=[parent_id])
            if created_tag is None:
                raise RuntimeError(f"Failed to create system tag {name}")
            tag_ids[name] = created_tag.id
        else:
            tag_ids[name] = existing.id

    return tag_ids


def tag_entries_with_system_tag(
    library: Library,
    entry_ids: int | list[int] | set[int],
    tag_name: str,
) -> int:
    """Attach a system tag to one or more entries.

    Returns the number of tag attachments made.
    """
    if isinstance(entry_ids, int):
        ids = [entry_ids]
    else:
        ids = list(entry_ids)

    if not ids:
        return 0

    system_tags = ensure_system_tags(library)
    tag_id = system_tags.get(tag_name)
    if tag_id is None:
        raise ValueError(f"Unknown system tag: {tag_name}")

    return library.add_tags_to_entries(ids, tag_id)


def sync_retroactive_system_tags(library: Library) -> dict[str, int]:
    """Perform a retroactive scan to apply system tags to all matching entries.

    - Matches backed-up originals in .TagStudio/remux_backups against library entries -> system:remuxed
    - Probes all video entries for corrupted/truncated container data -> system:corrupted
    - Probes all video entries for unsupported codecs requiring re-encoding -> system:unsupported

    Returns a summary dictionary with counts of tagged entries.
    """
    library_dir = library.library_dir
    if library_dir is None:
        raise ValueError("No library open.")

    system_tags = ensure_system_tags(library)
    ffprobe_cmd = find_ffprobe()

    remuxed_entry_ids: set[int] = set()
    corrupted_entry_ids: set[int] = set()
    unsupported_entry_ids: set[int] = set()

    # 1. Detect remuxed entries via backup folder
    backup_dir = library_dir / TS_FOLDER_NAME / "remux_backups"
    if backup_dir.exists():
        for backup_path in backup_dir.rglob("*"):
            if backup_path.is_file():
                try:
                    rel_p = backup_path.relative_to(backup_dir)
                except ValueError:
                    continue

                # Check for either the original path or .mp4 renamed path
                entry = library.get_entry_full_by_path(rel_p.with_suffix(".mp4"))
                if entry is None:
                    entry = library.get_entry_full_by_path(rel_p)

                if entry is not None:
                    remuxed_entry_ids.add(entry.id)

    # 2. Probe all video entries for corrupted / unsupported files
    if ffprobe_cmd is not None:
        for entry in library.all_entries():
            suffix = entry.path.suffix.lower().lstrip(".")
            if suffix in VIDEO_EXTENSIONS:
                full_p = library_dir / entry.path
                if full_p.is_file():
                    status = inspect_video(full_p, ffprobe_cmd)
                    if status == VideoInspectionStatus.CORRUPTED:
                        corrupted_entry_ids.add(entry.id)
                    elif status == VideoInspectionStatus.UNSUPPORTED:
                        unsupported_entry_ids.add(entry.id)

    # 3. Apply tags
    if remuxed_entry_ids:
        library.add_tags_to_entries(list(remuxed_entry_ids), system_tags[TAG_SYSTEM_REMUXED])
    if corrupted_entry_ids:
        library.add_tags_to_entries(list(corrupted_entry_ids), system_tags[TAG_SYSTEM_CORRUPTED])
    if unsupported_entry_ids:
        library.add_tags_to_entries(list(unsupported_entry_ids), system_tags[TAG_SYSTEM_UNSUPPORTED])

    logger.info(
        "sync_retroactive_system_tags.complete",
        remuxed_count=len(remuxed_entry_ids),
        corrupted_count=len(corrupted_entry_ids),
        unsupported_count=len(unsupported_entry_ids),
    )

    return {
        "remuxed_tagged": len(remuxed_entry_ids),
        "corrupted_tagged": len(corrupted_entry_ids),
        "unsupported_tagged": len(unsupported_entry_ids),
    }

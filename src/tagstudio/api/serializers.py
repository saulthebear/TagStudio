from datetime import date, datetime
from pathlib import Path
from typing import Any

from tagstudio.core.library.alchemy.fields import BaseField
from tagstudio.core.library.alchemy.models import Entry, Tag, TagColorGroup


def _iso(value: Any) -> str | None:
    if isinstance(value, datetime | date):
        return value.isoformat()
    if value is None:
        return None
    return str(value)


def serialize_tag(tag: Tag) -> dict[str, Any]:
    return {
        "id": tag.id,
        "name": tag.name,
        "shorthand": tag.shorthand,
        "aliases": sorted(tag.alias_strings),
        "parent_ids": sorted(tag.parent_ids),
        "color_namespace": tag.color_namespace,
        "color_slug": tag.color_slug,
        "disambiguation_id": tag.disambiguation_id,
        "is_category": tag.is_category,
        "is_hidden": tag.is_hidden,
    }


def serialize_tag_color(namespace_name: str, color: TagColorGroup) -> dict[str, Any]:
    return {
        "namespace": color.namespace,
        "namespace_name": namespace_name,
        "slug": color.slug,
        "name": color.name,
        "primary": color.primary,
        "secondary": color.secondary,
        "color_border": color.color_border,
    }


def serialize_field(field: BaseField) -> dict[str, Any]:
    return {
        "id": field.id,
        "type_key": field.type_key,
        "type_name": field.type.name,
        "kind": field.type.type.value,
        "value": _iso(field.value),
        "position": field.position,
    }


def serialize_entry_summary(entry: Entry) -> dict[str, Any]:
    return {
        "id": entry.id,
        "path": str(entry.path),
        "filename": entry.filename,
        "suffix": entry.suffix,
        "tag_ids": sorted(tag.id for tag in entry.tags),
    }


def serialize_entry(entry: Entry, library_dir: Path | None = None) -> dict[str, Any]:
    full_path = None
    if library_dir is not None:
        full_path = str(library_dir / entry.path)

    return {
        "id": entry.id,
        "path": str(entry.path),
        "full_path": full_path,
        "filename": entry.filename,
        "suffix": entry.suffix,
        "date_created": _iso(entry.date_created),
        "date_modified": _iso(entry.date_modified),
        "date_added": _iso(entry.date_added),
        "tags": [serialize_tag(tag) for tag in sorted(entry.tags)],
        "fields": [serialize_field(field) for field in entry.fields],
        "is_favorite": entry.is_favorite,
        "is_archived": entry.is_archived,
    }

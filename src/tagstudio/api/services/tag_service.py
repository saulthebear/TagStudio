from typing import Any

from fastapi import HTTPException
from sqlalchemy import delete, or_, select, update
from sqlalchemy.orm import Session

from tagstudio.api.schemas import (
    TagBatchDeleteRequest,
    TagBatchUpdateRequest,
    TagCreateRequest,
    TagMergeRequest,
    TagUpdateRequest,
)
from tagstudio.core.library.alchemy.constants import TAG_CHILDREN_ID_QUERY
from tagstudio.core.library.alchemy.joins import TagEntry, TagParent
from tagstudio.core.library.alchemy.library import Library
from tagstudio.core.library.alchemy.models import Tag, TagAlias


def get_descendant_tag_ids(lib: Library, tag_id: int) -> set[int]:
    if lib.engine is None:
        return set()
    with Session(lib.engine) as session:
        return set(session.scalars(TAG_CHILDREN_ID_QUERY, {"tag_id": tag_id}))


def validate_parent_ids_for_tag(
    lib: Library, *, tag_id: int | None, parent_ids: set[int]
) -> set[int]:
    if tag_id is not None and tag_id in parent_ids:
        raise HTTPException(status_code=422, detail="A tag cannot be its own parent.")

    for parent_id in parent_ids:
        if lib.get_tag(parent_id) is None:
            raise HTTPException(
                status_code=422,
                detail=f"Parent tag {parent_id} does not exist.",
            )

    if tag_id is not None:
        descendant_ids = get_descendant_tag_ids(lib, tag_id)
        cycle_parent_ids = parent_ids.intersection(descendant_ids)
        if cycle_parent_ids:
            raise HTTPException(
                status_code=422,
                detail="Circular tag hierarchy is not allowed.",
            )

    return parent_ids


def validate_disambiguation(disambiguation_id: int | None, parent_ids: set[int]) -> None:
    if disambiguation_id is None:
        return
    if disambiguation_id not in parent_ids:
        raise HTTPException(
            status_code=422,
            detail="disambiguation_id must reference one of parent_ids.",
        )


def create_tag(lib: Library, request: TagCreateRequest) -> Tag:
    parent_ids = validate_parent_ids_for_tag(
        lib,
        tag_id=None,
        parent_ids=set(request.parent_ids),
    )
    validate_disambiguation(request.disambiguation_id, parent_ids)

    tag = Tag(
        name=request.name,
        shorthand=request.shorthand,
        color_namespace=request.color_namespace,
        color_slug=request.color_slug,
        disambiguation_id=request.disambiguation_id,
        is_category=request.is_category,
        is_hidden=request.is_hidden,
        tag_type=request.tag_type,
    )

    created = lib.add_tag(
        tag=tag,
        parent_ids=parent_ids,
        alias_names=set(request.aliases),
        alias_ids=set(),
    )
    if created is None:
        raise HTTPException(status_code=409, detail="Tag already exists or cannot be created.")
    created_full = lib.get_tag(created.id)
    if created_full is None:
        raise HTTPException(status_code=500, detail="Failed to load created tag.")
    return created_full


def update_tag(lib: Library, tag_id: int, request: TagUpdateRequest) -> Tag:
    if lib.engine is None:
        raise HTTPException(status_code=409, detail="No library open.")

    provided_fields = request.model_fields_set
    with Session(lib.engine) as session:
        tag = session.get(Tag, tag_id)
        if tag is None:
            raise HTTPException(status_code=404, detail="Tag not found.")

        if "name" in provided_fields and request.name is None:
            raise HTTPException(status_code=422, detail="name cannot be null.")
        if "name" in provided_fields and request.name is not None:
            tag.name = request.name
        if "shorthand" in provided_fields:
            tag.shorthand = request.shorthand
        if "color_namespace" in provided_fields:
            tag.color_namespace = request.color_namespace
        if "color_slug" in provided_fields:
            tag.color_slug = request.color_slug
        if "is_category" in provided_fields and request.is_category is not None:
            tag.is_category = request.is_category
        if "is_hidden" in provided_fields and request.is_hidden is not None:
            tag.is_hidden = request.is_hidden
        if "tag_type" in provided_fields and request.tag_type is not None:
            tag.tag_type = request.tag_type

        existing_parent_ids = {
            parent_id
            for (parent_id,) in session.execute(
                select(TagParent.parent_id).where(TagParent.child_id == tag_id)
            ).all()
        }
        requested_parent_ids = (
            set(request.parent_ids or []) if "parent_ids" in provided_fields else None
        )
        effective_parent_ids = (
            requested_parent_ids if requested_parent_ids is not None else existing_parent_ids
        )
        effective_parent_ids = validate_parent_ids_for_tag(
            lib,
            tag_id=tag_id,
            parent_ids=set(effective_parent_ids),
        )

        if "disambiguation_id" in provided_fields:
            validate_disambiguation(request.disambiguation_id, effective_parent_ids)
            tag.disambiguation_id = request.disambiguation_id
        elif tag.disambiguation_id is not None and requested_parent_ids is not None:
            if tag.disambiguation_id not in effective_parent_ids:
                tag.disambiguation_id = None

        if requested_parent_ids is not None:
            session.execute(delete(TagParent).where(TagParent.child_id == tag_id))
            for parent_id in effective_parent_ids:
                session.add(TagParent(parent_id=parent_id, child_id=tag_id))

        if "aliases" in provided_fields:
            existing_aliases = session.scalars(
                select(TagAlias).where(TagAlias.tag_id == tag_id)
            ).all()
            desired_aliases = {alias for alias in (request.aliases or []) if alias}
            existing_by_name = {alias.name: alias for alias in existing_aliases}

            for alias in existing_aliases:
                if alias.name not in desired_aliases:
                    session.delete(alias)
            for alias_name in desired_aliases:
                if alias_name not in existing_by_name:
                    session.add(TagAlias(name=alias_name, tag_id=tag_id))

        session.commit()

    updated = lib.get_tag(tag_id)
    if updated is None:
        raise HTTPException(status_code=404, detail="Tag not found after update.")
    return updated


def merge_tags(lib: Library, request: TagMergeRequest) -> tuple[Tag, int, dict[str, Any]]:
    if lib.engine is None:
        raise HTTPException(status_code=409, detail="No library open.")

    target_tag_id = request.target_tag_id
    source_tag_ids = [sid for sid in set(request.source_tag_ids) if sid != target_tag_id]
    if not source_tag_ids:
        raise HTTPException(status_code=422, detail="No source tags to merge.")

    with Session(lib.engine) as session:
        target_tag = session.get(Tag, target_tag_id)
        if target_tag is None:
            raise HTTPException(status_code=404, detail="Target tag not found.")

        source_tags = [session.get(Tag, sid) for sid in source_tag_ids]
        if any(st is None for st in source_tags):
            raise HTTPException(status_code=404, detail="One or more source tags not found.")

        target_parent_ids = list(
            session.scalars(
                select(TagParent.parent_id).where(TagParent.child_id == target_tag_id)
            ).all()
        )
        target_snapshot = {
            "id": target_tag.id,
            "name": target_tag.name,
            "shorthand": target_tag.shorthand,
            "color_namespace": target_tag.color_namespace,
            "color_slug": target_tag.color_slug,
            "disambiguation_id": target_tag.disambiguation_id,
            "is_category": target_tag.is_category,
            "is_hidden": target_tag.is_hidden,
            "tag_type": target_tag.tag_type,
            "aliases": [a.name for a in target_tag.aliases],
            "parent_ids": target_parent_ids,
        }

        sources_snapshot: list[dict[str, Any]] = []
        all_affected_entry_ids: set[int] = set()
        entries_retagged_ids: list[int] = []

        target_entry_ids = set(
            session.scalars(select(TagEntry.entry_id).where(TagEntry.tag_id == target_tag_id)).all()
        )

        for stag in source_tags:
            assert stag is not None
            stag_id = stag.id
            stag_entry_ids = list(
                session.scalars(select(TagEntry.entry_id).where(TagEntry.tag_id == stag_id)).all()
            )
            all_affected_entry_ids.update(stag_entry_ids)

            stag_parent_ids = list(
                session.scalars(
                    select(TagParent.parent_id).where(TagParent.child_id == stag_id)
                ).all()
            )
            stag_child_ids = list(
                session.scalars(
                    select(TagParent.child_id).where(TagParent.parent_id == stag_id)
                ).all()
            )
            stag_disambiguated_ids = list(
                session.scalars(select(Tag.id).where(Tag.disambiguation_id == stag_id)).all()
            )

            sources_snapshot.append(
                {
                    "id": stag.id,
                    "name": stag.name,
                    "shorthand": stag.shorthand,
                    "color_namespace": stag.color_namespace,
                    "color_slug": stag.color_slug,
                    "disambiguation_id": stag.disambiguation_id,
                    "is_category": stag.is_category,
                    "is_hidden": stag.is_hidden,
                    "tag_type": stag.tag_type,
                    "aliases": [a.name for a in stag.aliases],
                    "parent_ids": stag_parent_ids,
                    "child_ids": stag_child_ids,
                    "disambiguated_ids": stag_disambiguated_ids,
                    "entry_ids": stag_entry_ids,
                }
            )

            for eid in stag_entry_ids:
                if eid not in target_entry_ids:
                    session.add(TagEntry(tag_id=target_tag_id, entry_id=eid))
                    target_entry_ids.add(eid)
                    entries_retagged_ids.append(eid)

            session.execute(delete(TagEntry).where(TagEntry.tag_id == stag_id))

            for cid in stag_child_ids:
                if cid != target_tag_id:
                    existing_child_parent = session.execute(
                        select(TagParent).where(
                            TagParent.parent_id == target_tag_id, TagParent.child_id == cid
                        )
                    ).scalar_one_or_none()
                    if not existing_child_parent:
                        session.add(TagParent(parent_id=target_tag_id, child_id=cid))
            session.execute(
                delete(TagParent).where(
                    or_(TagParent.parent_id == stag_id, TagParent.child_id == stag_id)
                )
            )

            for did in stag_disambiguated_ids:
                if did != target_tag_id:
                    session.execute(
                        update(Tag).where(Tag.id == did).values(disambiguation_id=target_tag_id)
                    )

            session.execute(delete(TagAlias).where(TagAlias.tag_id == stag_id))
            session.execute(delete(Tag).where(Tag.id == stag_id))

        if request.updated_tag:
            up = request.updated_tag
            provided = up.model_fields_set
            if "name" in provided and up.name is not None:
                target_tag.name = up.name
            if "shorthand" in provided:
                target_tag.shorthand = up.shorthand
            if "color_namespace" in provided:
                target_tag.color_namespace = up.color_namespace
            if "color_slug" in provided:
                target_tag.color_slug = up.color_slug
            if "is_category" in provided and up.is_category is not None:
                target_tag.is_category = up.is_category
            if "is_hidden" in provided and up.is_hidden is not None:
                target_tag.is_hidden = up.is_hidden
            if "tag_type" in provided and up.tag_type is not None:
                target_tag.tag_type = up.tag_type

            if "parent_ids" in provided and up.parent_ids is not None:
                validated_parents = validate_parent_ids_for_tag(
                    lib, tag_id=target_tag_id, parent_ids=set(up.parent_ids)
                )
                session.execute(delete(TagParent).where(TagParent.child_id == target_tag_id))
                for pid in validated_parents:
                    session.add(TagParent(parent_id=pid, child_id=target_tag_id))

            if "disambiguation_id" in provided:
                current_parents = set(
                    session.scalars(
                        select(TagParent.parent_id).where(TagParent.child_id == target_tag_id)
                    ).all()
                )
                validate_disambiguation(up.disambiguation_id, current_parents)
                target_tag.disambiguation_id = up.disambiguation_id

            if "aliases" in provided and up.aliases is not None:
                session.execute(delete(TagAlias).where(TagAlias.tag_id == target_tag_id))
                desired_aliases = {a.strip() for a in up.aliases if a and a.strip()}
                for a_name in desired_aliases:
                    session.add(TagAlias(name=a_name, tag_id=target_tag_id))

        session.commit()

    undo_data = {
        "operation": "merge",
        "target_snapshot": target_snapshot,
        "sources_snapshot": sources_snapshot,
        "entries_retagged_ids": entries_retagged_ids,
    }

    updated_target = lib.get_tag(target_tag_id)
    if updated_target is None:
        raise HTTPException(status_code=500, detail="Failed to load target tag after merge.")

    return updated_target, len(all_affected_entry_ids), undo_data


def undo_merge_tags(lib: Library, undo_data: dict[str, Any]) -> Tag:
    if lib.engine is None:
        raise HTTPException(status_code=409, detail="No library open.")

    target_snapshot = undo_data.get("target_snapshot")
    sources_snapshot = undo_data.get("sources_snapshot", [])
    entries_retagged_ids = undo_data.get("entries_retagged_ids", [])

    if not target_snapshot:
        raise HTTPException(status_code=422, detail="Invalid undo data.")

    target_tag_id = target_snapshot["id"]

    with Session(lib.engine) as session:
        if entries_retagged_ids:
            session.execute(
                delete(TagEntry).where(
                    TagEntry.tag_id == target_tag_id, TagEntry.entry_id.in_(entries_retagged_ids)
                )
            )

        for s in sources_snapshot:
            new_tag = Tag(
                id=s["id"],
                name=s["name"],
                shorthand=s["shorthand"],
                color_namespace=s["color_namespace"],
                color_slug=s["color_slug"],
                disambiguation_id=s["disambiguation_id"],
                is_category=s["is_category"],
                is_hidden=s["is_hidden"],
                tag_type=s["tag_type"],
            )
            session.add(new_tag)
            session.flush()

            for alias_name in s.get("aliases", []):
                session.add(TagAlias(name=alias_name, tag_id=s["id"]))

            for pid in s.get("parent_ids", []):
                session.add(TagParent(parent_id=pid, child_id=s["id"]))

            for cid in s.get("child_ids", []):
                if cid != target_tag_id:
                    session.add(TagParent(parent_id=s["id"], child_id=cid))

            for did in s.get("disambiguated_ids", []):
                session.execute(update(Tag).where(Tag.id == did).values(disambiguation_id=s["id"]))

            for eid in s.get("entry_ids", []):
                session.add(TagEntry(tag_id=s["id"], entry_id=eid))

        target_tag = session.get(Tag, target_tag_id)
        if target_tag:
            target_tag.name = target_snapshot["name"]
            target_tag.shorthand = target_snapshot["shorthand"]
            target_tag.color_namespace = target_snapshot["color_namespace"]
            target_tag.color_slug = target_snapshot["color_slug"]
            target_tag.disambiguation_id = target_snapshot["disambiguation_id"]
            target_tag.is_category = target_snapshot["is_category"]
            target_tag.is_hidden = target_snapshot["is_hidden"]
            target_tag.tag_type = target_snapshot["tag_type"]

            session.execute(delete(TagParent).where(TagParent.child_id == target_tag_id))
            for pid in target_snapshot.get("parent_ids", []):
                session.add(TagParent(parent_id=pid, child_id=target_tag_id))

            session.execute(delete(TagAlias).where(TagAlias.tag_id == target_tag_id))
            for alias_name in target_snapshot.get("aliases", []):
                session.add(TagAlias(name=alias_name, tag_id=target_tag_id))

        session.commit()

    restored_target = lib.get_tag(target_tag_id)
    if restored_target is None:
        raise HTTPException(status_code=500, detail="Failed to load target tag after undo.")
    return restored_target


def batch_update_tags(lib: Library, request: TagBatchUpdateRequest) -> list[Tag]:
    if lib.engine is None:
        raise HTTPException(status_code=409, detail="No library open.")

    tag_ids = set(request.tag_ids)
    if not tag_ids:
        return []

    with Session(lib.engine) as session:
        tags = session.scalars(select(Tag).where(Tag.id.in_(tag_ids))).all()
        if not tags:
            return []

        for tag in tags:
            if request.tag_type is not None:
                tag.tag_type = request.tag_type
            if request.is_hidden is not None:
                tag.is_hidden = request.is_hidden
            if request.is_category is not None:
                tag.is_category = request.is_category
            if request.add_parent_ids:
                existing_parents = set(
                    session.scalars(
                        select(TagParent.parent_id).where(TagParent.child_id == tag.id)
                    ).all()
                )
                valid_new = [
                    pid
                    for pid in request.add_parent_ids
                    if pid != tag.id and pid not in existing_parents
                ]
                for pid in valid_new:
                    session.add(TagParent(parent_id=pid, child_id=tag.id))

        session.commit()

    result_tags: list[Tag] = []
    for tid in tag_ids:
        tag_obj = lib.get_tag(tid)
        if tag_obj is not None:
            result_tags.append(tag_obj)
    return result_tags


def batch_delete_tags(lib: Library, request: TagBatchDeleteRequest) -> tuple[int, dict[str, Any]]:
    if lib.engine is None:
        raise HTTPException(status_code=409, detail="No library open.")

    tag_ids = set(request.tag_ids)
    if not tag_ids:
        return 0, {}

    snapshots: list[dict[str, Any]] = []
    with Session(lib.engine) as session:
        tags = session.scalars(select(Tag).where(Tag.id.in_(tag_ids))).all()
        for tag in tags:
            tid = tag.id
            parent_ids = list(
                session.scalars(select(TagParent.parent_id).where(TagParent.child_id == tid)).all()
            )
            child_ids = list(
                session.scalars(select(TagParent.child_id).where(TagParent.parent_id == tid)).all()
            )
            disambiguated_ids = list(
                session.scalars(select(Tag.id).where(Tag.disambiguation_id == tid)).all()
            )
            entry_ids = list(
                session.scalars(select(TagEntry.entry_id).where(TagEntry.tag_id == tid)).all()
            )
            aliases = [a.name for a in tag.aliases]

            snapshots.append(
                {
                    "id": tag.id,
                    "name": tag.name,
                    "shorthand": tag.shorthand,
                    "color_namespace": tag.color_namespace,
                    "color_slug": tag.color_slug,
                    "disambiguation_id": tag.disambiguation_id,
                    "is_category": tag.is_category,
                    "is_hidden": tag.is_hidden,
                    "tag_type": tag.tag_type,
                    "aliases": aliases,
                    "parent_ids": parent_ids,
                    "child_ids": child_ids,
                    "disambiguated_ids": disambiguated_ids,
                    "entry_ids": entry_ids,
                }
            )

            session.execute(delete(TagAlias).where(TagAlias.tag_id == tid))
            session.execute(delete(TagEntry).where(TagEntry.tag_id == tid))
            session.execute(
                delete(TagParent).where(or_(TagParent.child_id == tid, TagParent.parent_id == tid))
            )
            session.execute(
                update(Tag).where(Tag.disambiguation_id == tid).values(disambiguation_id=None)
            )
            session.execute(delete(Tag).where(Tag.id == tid))

        session.commit()

    undo_data = {"operation": "batch_delete", "snapshots": snapshots}
    return len(snapshots), undo_data


def undo_batch_delete_tags(lib: Library, undo_data: dict[str, Any]) -> int:
    if lib.engine is None:
        raise HTTPException(status_code=409, detail="No library open.")

    snapshots = undo_data.get("snapshots", [])
    if not snapshots:
        return 0

    with Session(lib.engine) as session:
        for s in snapshots:
            new_tag = Tag(
                id=s["id"],
                name=s["name"],
                shorthand=s["shorthand"],
                color_namespace=s["color_namespace"],
                color_slug=s["color_slug"],
                disambiguation_id=s["disambiguation_id"],
                is_category=s["is_category"],
                is_hidden=s["is_hidden"],
                tag_type=s["tag_type"],
            )
            session.add(new_tag)
            session.flush()

            for alias_name in s.get("aliases", []):
                session.add(TagAlias(name=alias_name, tag_id=s["id"]))

            for pid in s.get("parent_ids", []):
                session.add(TagParent(parent_id=pid, child_id=s["id"]))

            for cid in s.get("child_ids", []):
                session.add(TagParent(parent_id=s["id"], child_id=cid))

            for did in s.get("disambiguated_ids", []):
                session.execute(update(Tag).where(Tag.id == did).values(disambiguation_id=s["id"]))

            for eid in s.get("entry_ids", []):
                session.add(TagEntry(tag_id=s["id"], entry_id=eid))

        session.commit()

    return len(snapshots)

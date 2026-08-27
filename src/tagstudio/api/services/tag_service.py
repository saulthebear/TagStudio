from fastapi import HTTPException
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from tagstudio.api.schemas import TagCreateRequest, TagUpdateRequest
from tagstudio.core.library.alchemy.constants import TAG_CHILDREN_ID_QUERY
from tagstudio.core.library.alchemy.joins import TagParent
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

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class SortingMode(str, Enum):
    DATE_ADDED = "file.date_added"
    FILE_NAME = "generic.filename"
    PATH = "file.path"
    RANDOM = "sorting.mode.random"


class HealthResponse(BaseModel):
    status: str = "ok"


class LibraryOpenRequest(BaseModel):
    path: str


class LibraryCreateRequest(BaseModel):
    path: str


class LibraryStateResponse(BaseModel):
    is_open: bool
    library_path: str | None = None
    entries_count: int = 0
    tags_count: int = 0


class SearchRequest(BaseModel):
    query: str | None = None
    page_index: int = 0
    page_size: int = Field(default=200, ge=1, le=2000)
    sorting_mode: SortingMode = SortingMode.DATE_ADDED
    ascending: bool = True
    show_hidden_entries: bool = False


class TagResponse(BaseModel):
    id: int
    name: str
    shorthand: str | None = None
    aliases: list[str] = Field(default_factory=list)
    parent_ids: list[int] = Field(default_factory=list)
    color_namespace: str | None = None
    color_slug: str | None = None
    disambiguation_id: int | None = None
    is_category: bool = False
    is_hidden: bool = False


class FieldResponse(BaseModel):
    id: int
    type_key: str
    type_name: str
    kind: str
    value: Any = None
    position: int


class EntrySummaryResponse(BaseModel):
    id: int
    path: str
    filename: str
    suffix: str
    tag_ids: list[int] = Field(default_factory=list)


class EntryResponse(BaseModel):
    id: int
    path: str
    full_path: str | None = None
    filename: str
    suffix: str
    date_created: str | None = None
    date_modified: str | None = None
    date_added: str | None = None
    tags: list[TagResponse] = Field(default_factory=list)
    fields: list[FieldResponse] = Field(default_factory=list)
    is_favorite: bool = False
    is_archived: bool = False


class SearchResponse(BaseModel):
    total_count: int
    ids: list[int]
    entries: list[EntrySummaryResponse]


class UpdateFieldRequest(BaseModel):
    value: str


class TagMutationRequest(BaseModel):
    entry_ids: list[int] = Field(default_factory=list)
    tag_ids: list[int] = Field(default_factory=list)


class TagMutationResponse(BaseModel):
    success: bool
    changed: int = 0


class TagCreateRequest(BaseModel):
    name: str
    shorthand: str | None = None
    aliases: list[str] = Field(default_factory=list)
    parent_ids: list[int] = Field(default_factory=list)
    color_namespace: str | None = None
    color_slug: str | None = None
    disambiguation_id: int | None = None
    is_category: bool = False
    is_hidden: bool = False


class TagUpdateRequest(BaseModel):
    name: str | None = None
    shorthand: str | None = None
    aliases: list[str] | None = None
    parent_ids: list[int] | None = None
    color_namespace: str | None = None
    color_slug: str | None = None
    disambiguation_id: int | None = None
    is_category: bool | None = None
    is_hidden: bool | None = None


class JobStatusResponse(BaseModel):
    job_id: str
    operation: str
    status: str
    progress_current: int = 0
    progress_total: int | None = None
    message: str | None = None
    error: str | None = None
    is_terminal: bool


class JobCreateResponse(BaseModel):
    job_id: str
    status: str


class SuccessResponse(BaseModel):
    success: bool

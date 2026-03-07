from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field


class SortingMode(str, Enum):
    DATE_ADDED = "file.date_added"
    FILE_NAME = "generic.filename"
    PATH = "file.path"
    RANDOM = "sorting.mode.random"


class PreviewKind(str, Enum):
    IMAGE = "image"
    VIDEO = "video"
    AUDIO = "audio"
    TEXT = "text"
    BINARY = "binary"
    MISSING = "missing"


class ThumbnailFit(str, Enum):
    COVER = "cover"
    CONTAIN = "contain"


class ThumbnailKind(str, Enum):
    GRID = "grid"
    PREVIEW = "preview"


class ThumbnailPriority(str, Enum):
    FOREGROUND = "foreground"
    BACKGROUND = "background"


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


class TagColorResponse(BaseModel):
    namespace: str
    namespace_name: str
    slug: str
    name: str
    primary: str
    secondary: str | None = None
    color_border: bool = False


class TagColorNamespaceResponse(BaseModel):
    namespace: str
    namespace_name: str
    colors: list[TagColorResponse] = Field(default_factory=list)


class FieldResponse(BaseModel):
    id: int
    type_key: str
    type_name: str
    kind: str
    value: Any = None
    position: int


class FieldTypeResponse(BaseModel):
    key: str
    name: str
    kind: str
    is_default: bool
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


class PreviewResponse(BaseModel):
    entry_id: int
    preview_kind: PreviewKind
    media_type: str | None = None
    media_url: str | None = None
    thumbnail_url: str | None = None
    poster_url: str | None = None
    text_excerpt: str | None = None
    supports_media_controls: bool = False


class ThumbnailPrewarmRequest(BaseModel):
    entry_ids: list[int] = Field(default_factory=list, max_length=100)
    size: int | None = Field(default=None, ge=32, le=2048)
    fit: ThumbnailFit = ThumbnailFit.COVER
    kind: ThumbnailKind = ThumbnailKind.GRID
    priority: ThumbnailPriority = ThumbnailPriority.BACKGROUND


class ThumbnailPrewarmResponse(BaseModel):
    accepted: int = 0
    skipped: int = 0


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


class LayoutSettings(BaseModel):
    main_split_ratio: float = Field(default=0.78, ge=0.0, le=1.0)
    main_left_collapsed: bool = False
    main_right_collapsed: bool = False
    main_last_open_ratio: float = Field(default=0.78, ge=0.0, le=1.0)
    inspector_split_ratio: float = Field(default=0.52, ge=0.0, le=1.0)
    preview_collapsed: bool = False
    metadata_collapsed: bool = False
    inspector_last_open_ratio: float = Field(default=0.52, ge=0.0, le=1.0)
    mobile_active_pane: Literal["grid", "preview", "metadata"] = "grid"


class LayoutSettingsUpdateRequest(BaseModel):
    main_split_ratio: float | None = Field(default=None, ge=0.0, le=1.0)
    main_left_collapsed: bool | None = None
    main_right_collapsed: bool | None = None
    main_last_open_ratio: float | None = Field(default=None, ge=0.0, le=1.0)
    inspector_split_ratio: float | None = Field(default=None, ge=0.0, le=1.0)
    preview_collapsed: bool | None = None
    metadata_collapsed: bool | None = None
    inspector_last_open_ratio: float | None = Field(default=None, ge=0.0, le=1.0)
    mobile_active_pane: Literal["grid", "preview", "metadata"] | None = None


class ThumbnailSettings(BaseModel):
    cache_max_mib: int = Field(default=512, ge=64, le=16384)
    grid_size: int = Field(default=256, ge=32, le=2048)
    preview_size: int = Field(default=768, ge=32, le=2048)
    quality: int = Field(default=80, ge=1, le=100)


class ThumbnailSettingsUpdateRequest(BaseModel):
    cache_max_mib: int | None = Field(default=None, ge=64, le=16384)
    grid_size: int | None = Field(default=None, ge=32, le=2048)
    preview_size: int | None = Field(default=None, ge=32, le=2048)
    quality: int | None = Field(default=None, ge=1, le=100)


class SettingsResponse(BaseModel):
    sorting_mode: SortingMode = SortingMode.DATE_ADDED
    ascending: bool = True
    show_hidden_entries: bool = False
    page_size: int = Field(default=200, ge=1, le=2000)
    layout: LayoutSettings = Field(default_factory=LayoutSettings)
    thumbnails: ThumbnailSettings = Field(default_factory=ThumbnailSettings)


class SettingsUpdateRequest(BaseModel):
    sorting_mode: SortingMode | None = None
    ascending: bool | None = None
    show_hidden_entries: bool | None = None
    page_size: int | None = Field(default=None, ge=1, le=2000)
    layout: LayoutSettingsUpdateRequest | None = None
    thumbnails: ThumbnailSettingsUpdateRequest | None = None


class SuccessResponse(BaseModel):
    success: bool

export type LibraryStateResponse = {
  is_open: boolean;
  library_path: string | null;
  entries_count: number;
  tags_count: number;
};

export type TagResponse = {
  id: number;
  name: string;
  shorthand: string | null;
  aliases: string[];
  parent_ids: number[];
  color_namespace: string | null;
  color_slug: string | null;
  disambiguation_id: number | null;
  is_category: boolean;
  is_hidden: boolean;
};

export type FieldResponse = {
  id: number;
  type_key: string;
  type_name: string;
  kind: string;
  value: unknown;
  position: number;
};

export type FieldTypeResponse = {
  key: string;
  name: string;
  kind: string;
  is_default: boolean;
  position: number;
};

export type EntrySummaryResponse = {
  id: number;
  path: string;
  filename: string;
  suffix: string;
  tag_ids: number[];
};

export type EntryResponse = {
  id: number;
  path: string;
  full_path: string | null;
  filename: string;
  suffix: string;
  date_created: string | null;
  date_modified: string | null;
  date_added: string | null;
  tags: TagResponse[];
  fields: FieldResponse[];
  is_favorite: boolean;
  is_archived: boolean;
};

export type SortingMode = "file.date_added" | "generic.filename" | "file.path" | "sorting.mode.random";

export type SearchRequest = {
  query?: string;
  page_index?: number;
  page_size?: number;
  sorting_mode?: SortingMode;
  ascending?: boolean;
  show_hidden_entries?: boolean;
};

export type PreviewKind = "image" | "video" | "audio" | "text" | "binary" | "missing";

export type PreviewResponse = {
  entry_id: number;
  preview_kind: PreviewKind;
  media_type: string | null;
  media_url: string | null;
  thumbnail_url: string | null;
  poster_url: string | null;
  text_excerpt: string | null;
  supports_media_controls: boolean;
};

export type ThumbnailFit = "cover" | "contain";
export type ThumbnailKind = "grid" | "preview";
export type ThumbnailPriority = "foreground" | "background";

export type ThumbnailPrewarmRequest = {
  entry_ids: number[];
  size?: number;
  fit?: ThumbnailFit;
  kind?: ThumbnailKind;
  priority?: ThumbnailPriority;
};

export type ThumbnailPrewarmResponse = {
  accepted: number;
  skipped: number;
};

export type SearchResponse = {
  total_count: number;
  ids: number[];
  entries: EntrySummaryResponse[];
};

export type TagMutationResponse = {
  success: boolean;
  changed: number;
};

export type JobCreateResponse = {
  job_id: string;
  status: string;
};

export type JobStatusResponse = {
  job_id: string;
  operation: string;
  status: string;
  progress_current: number;
  progress_total: number | null;
  message: string | null;
  error: string | null;
  is_terminal: boolean;
};

export type JobEventPayload = JobStatusResponse & {
  timestamp: string;
};

export type SettingsResponse = {
  sorting_mode: SortingMode;
  ascending: boolean;
  show_hidden_entries: boolean;
  page_size: number;
  layout: LayoutSettings;
  thumbnails: ThumbnailSettings;
};

export type LayoutSettings = {
  main_split_ratio: number;
  main_left_collapsed: boolean;
  main_right_collapsed: boolean;
  main_last_open_ratio: number;
  inspector_split_ratio: number;
  preview_collapsed: boolean;
  metadata_collapsed: boolean;
  inspector_last_open_ratio: number;
  mobile_active_pane: "grid" | "preview" | "metadata";
};

export type LayoutSettingsUpdateRequest = {
  main_split_ratio?: number;
  main_left_collapsed?: boolean;
  main_right_collapsed?: boolean;
  main_last_open_ratio?: number;
  inspector_split_ratio?: number;
  preview_collapsed?: boolean;
  metadata_collapsed?: boolean;
  inspector_last_open_ratio?: number;
  mobile_active_pane?: "grid" | "preview" | "metadata";
};

export type ThumbnailSettings = {
  cache_max_mib: number;
  grid_size: number;
  preview_size: number;
  quality: number;
};

export type ThumbnailSettingsUpdateRequest = {
  cache_max_mib?: number;
  grid_size?: number;
  preview_size?: number;
  quality?: number;
};

export type SettingsUpdateRequest = {
  sorting_mode?: SortingMode;
  ascending?: boolean;
  show_hidden_entries?: boolean;
  page_size?: number;
  layout?: LayoutSettingsUpdateRequest;
  thumbnails?: ThumbnailSettingsUpdateRequest;
};

export type ApiConfig = {
  baseUrl: string;
  token?: string;
};

export class TagStudioApiClient {
  readonly baseUrl: string;
  private readonly token?: string;

  constructor(config: ApiConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.token = config.token;
  }

  async health(): Promise<{ status: string }> {
    return this.request("/api/v1/health");
  }

  async openLibrary(payload: { path: string }): Promise<LibraryStateResponse> {
    return this.request("/api/v1/libraries/open", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  async createLibrary(payload: { path: string }): Promise<LibraryStateResponse> {
    return this.request("/api/v1/libraries/create", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  async getLibraryState(): Promise<LibraryStateResponse> {
    return this.request("/api/v1/libraries/state");
  }

  async getSettings(): Promise<SettingsResponse> {
    return this.request("/api/v1/settings");
  }

  async updateSettings(payload: SettingsUpdateRequest): Promise<SettingsResponse> {
    return this.request("/api/v1/settings", {
      method: "PATCH",
      body: JSON.stringify(payload)
    });
  }

  async getFieldTypes(): Promise<FieldTypeResponse[]> {
    return this.request("/api/v1/field-types");
  }

  async getTags(query?: string): Promise<TagResponse[]> {
    const params = new URLSearchParams();
    if (query?.trim()) {
      params.set("query", query.trim());
    }
    const suffix = params.size > 0 ? `?${params}` : "";
    return this.request(`/api/v1/tags${suffix}`);
  }

  async search(payload: SearchRequest): Promise<SearchResponse> {
    return this.request("/api/v1/search", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  async getEntry(entryId: number): Promise<EntryResponse> {
    return this.request(`/api/v1/entries/${entryId}`);
  }

  async getPreview(entryId: number): Promise<PreviewResponse> {
    return this.request(`/api/v1/entries/${entryId}/preview`);
  }

  getMediaUrl(entryId: number): string {
    return this.resolveUrl(`/api/v1/entries/${entryId}/media`);
  }

  getThumbnailUrl(
    entryId: number,
    options: {
      size?: number;
      fit?: ThumbnailFit;
      kind?: ThumbnailKind;
    } = {}
  ): string {
    const params = new URLSearchParams();
    if (options.size !== undefined) {
      params.set("size", String(options.size));
    }
    if (options.fit) {
      params.set("fit", options.fit);
    }
    if (options.kind) {
      params.set("kind", options.kind);
    }
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    return this.resolveUrl(`/api/v1/entries/${entryId}/thumbnail${suffix}`);
  }

  async prewarmThumbnails(
    payload: ThumbnailPrewarmRequest
  ): Promise<ThumbnailPrewarmResponse> {
    return this.request("/api/v1/thumbnails/prewarm", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  async updateEntryField(
    entryId: number,
    fieldKey: string,
    value: string
  ): Promise<EntryResponse> {
    return this.request(`/api/v1/entries/${entryId}/fields/${fieldKey}`, {
      method: "PATCH",
      body: JSON.stringify({ value })
    });
  }

  async createTag(payload: {
    name: string;
    shorthand?: string | null;
    aliases?: string[];
    parent_ids?: number[];
    color_namespace?: string | null;
    color_slug?: string | null;
    disambiguation_id?: number | null;
    is_category?: boolean;
    is_hidden?: boolean;
  }): Promise<TagResponse> {
    return this.request("/api/v1/tags", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  async addTagsToEntries(entryIds: number[], tagIds: number[]): Promise<TagMutationResponse> {
    return this.request("/api/v1/entries/tags:add", {
      method: "POST",
      body: JSON.stringify({
        entry_ids: entryIds,
        tag_ids: tagIds
      })
    });
  }

  async removeTagsFromEntries(entryIds: number[], tagIds: number[]): Promise<TagMutationResponse> {
    return this.request("/api/v1/entries/tags:remove", {
      method: "POST",
      body: JSON.stringify({
        entry_ids: entryIds,
        tag_ids: tagIds
      })
    });
  }

  async startRefreshJob(): Promise<JobCreateResponse> {
    return this.request("/api/v1/jobs/refresh", {
      method: "POST"
    });
  }

  async getJob(jobId: string): Promise<JobStatusResponse> {
    return this.request(`/api/v1/jobs/${jobId}`);
  }

  getJobEventsUrl(jobId: string): string {
    return this.resolveUrl(`/api/v1/jobs/${jobId}/events`);
  }

  resolveUrl(path: string): string {
    const baseUrl = new URL(`${this.baseUrl}/`);
    const resolvedPath = path.startsWith("http://")
      || path.startsWith("https://")
      || path.startsWith("//")
      || path.startsWith("/")
      ? path
      : `/${path}`;
    const url = new URL(resolvedPath, baseUrl);
    if (url.origin !== baseUrl.origin) {
      return url.toString();
    }
    return this.withTokenQuery(url).toString();
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    if (!headers.has("Content-Type") && init.body) {
      headers.set("Content-Type", "application/json");
    }
    if (this.token) {
      headers.set("x-tagstudio-token", this.token);
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers
    });

    if (!response.ok) {
      const text = await response.text();
      let detail = text;
      try {
        const parsed = JSON.parse(text) as { detail?: string };
        if (parsed.detail) {
          detail = parsed.detail;
        }
      } catch {
        // Keep raw text.
      }
      throw new Error(`API request failed (${response.status}): ${detail}`);
    }

    return (await response.json()) as T;
  }

  private withTokenQuery(url: URL): URL {
    if (!this.token) {
      return url;
    }
    if (!url.searchParams.has("token")) {
      // EventSource and direct media URLs may not carry custom auth headers.
      url.searchParams.set("token", this.token);
    }
    return url;
  }
}

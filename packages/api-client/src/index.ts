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

export type TagStatResponse = {
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
  entry_count: number;
};

export type TagCoOccurrence = {
  tag_id_a: number;
  tag_id_b: number;
  shared_count: number;
};

export type TagStatsResponse = {
  tags: TagStatResponse[];
  co_occurrences: TagCoOccurrence[];
};

export type TagSearchResponse = {
  items: TagResponse[];
  total_count: number;
  offset: number;
  limit: number;
  has_more: boolean;
};

export type TagSuggestionItem = {
  tag: TagResponse;
  score: number;
  confidence: number;
  shared_entries_count: number;
};

export type TagSuggestionsRequest = {
  tag_ids: number[];
  exclude_tag_ids?: number[];
  limit?: number;
};

export type TagSuggestionsResponse = {
  suggestions: TagSuggestionItem[];
};

export type TagColorResponse = {
  namespace: string;
  namespace_name: string;
  slug: string;
  name: string;
  primary: string;
  secondary: string | null;
  color_border: boolean;
};

export type TagColorNamespaceResponse = {
  namespace: string;
  namespace_name: string;
  colors: TagColorResponse[];
};

export type TagCreatePayload = {
  name: string;
  shorthand?: string | null;
  aliases?: string[];
  parent_ids?: number[];
  color_namespace?: string | null;
  color_slug?: string | null;
  disambiguation_id?: number | null;
  is_category?: boolean;
  is_hidden?: boolean;
};

export type TagUpdatePayload = {
  name?: string | null;
  shorthand?: string | null;
  aliases?: string[] | null;
  parent_ids?: number[] | null;
  color_namespace?: string | null;
  color_slug?: string | null;
  disambiguation_id?: number | null;
  is_category?: boolean | null;
  is_hidden?: boolean | null;
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
  random_seed?: number;
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
  random_seed?: number | null;
};

export type TagMutationResponse = {
  success: boolean;
  changed: number;
};

export type TrashFailureReasonCode =
  | "ENTRY_NOT_FOUND"
  | "MISSING_ON_DISK"
  | "NOT_A_FILE"
  | "PERMISSION_DENIED"
  | "OS_ERROR"
  | "UNKNOWN_ERROR";

export type TrashEntryFailure = {
  entry_id: number;
  path: string | null;
  reason_code: TrashFailureReasonCode;
};

export type TrashEntriesResponse = {
  success: boolean;
  deleted_entry_ids: number[];
  deleted_count: number;
  failed_count: number;
  failed_entries: TrashEntryFailure[];
};

export type EntryShellActionFailureReasonCode =
  | "ENTRY_NOT_FOUND"
  | "MISSING_ON_DISK"
  | "NOT_A_FILE"
  | "PERMISSION_DENIED"
  | "COMMAND_NOT_FOUND"
  | "OS_ERROR"
  | "UNKNOWN_ERROR";

export type EntryShellActionFailure = {
  entry_id: number;
  path: string | null;
  reason_code: EntryShellActionFailureReasonCode;
};

export type OpenEntriesResponse = {
  success: boolean;
  opened_entry_ids: number[];
  opened_count: number;
  failed_count: number;
  failed_entries: EntryShellActionFailure[];
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
  remux_candidates_count?: number | null;
};

export type JobEventPayload = JobStatusResponse & {
  timestamp: string;
};

export type RemuxMode = "backup" | "replace";
export type RemuxOnImport = "off" | "ask" | "auto";

export type RemuxSettings = {
  mode: RemuxMode;
  on_import: RemuxOnImport;
};

export type RemuxSettingsUpdateRequest = {
  mode?: RemuxMode;
  on_import?: RemuxOnImport;
};

export type RemuxCheckResponse = {
  candidates_count: number;
  total_scanned: number;
};

export type RemuxBackupInfoResponse = {
  total_bytes: number;
  file_count: number;
};

export type RemuxPurgeResponse = {
  files_deleted: number;
};

export type SystemTagsSyncResponse = {
  remuxed_tagged: number;
  corrupted_tagged: number;
  unsupported_tagged: number;
};


export type SettingsResponse = {
  sorting_mode: SortingMode;
  ascending: boolean;
  show_hidden_entries: boolean;
  page_size: number;
  layout: LayoutSettings;
  thumbnails: ThumbnailSettings;
  confirmations: ConfirmationSettings;
  remux: RemuxSettings;
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

export type ConfirmationSettings = {
  confirm_before_trash: boolean;
};

export type ConfirmationSettingsUpdateRequest = {
  confirm_before_trash?: boolean;
};

export type SettingsUpdateRequest = {
  sorting_mode?: SortingMode;
  ascending?: boolean;
  show_hidden_entries?: boolean;
  page_size?: number;
  layout?: LayoutSettingsUpdateRequest;
  thumbnails?: ThumbnailSettingsUpdateRequest;
  confirmations?: ConfirmationSettingsUpdateRequest;
  remux?: RemuxSettingsUpdateRequest;
};

export type TelemetryRouteStat = {
  route: string;
  count: number;
  errors: number;
  avg_ms: number;
  p95_ms: number;
};

export type TelemetrySlowOperation = {
  category: string;
  operation: string;
  duration_ms: number;
  timestamp: string;
  trace_id: string | null;
  metadata: Record<string, unknown> | null;
};

export type TelemetryTimeseriesPoint = {
  timestamp: string;
  requests: number;
  errors: number;
  avg_latency_ms: number;
  p50_ms: number;
  p95_ms: number;
  thumbnail_hits: number;
  thumbnail_misses: number;
};

export type TelemetrySummaryResponse = {
  window_seconds: number;
  api: {
    total_requests: number;
    error_requests: number;
    error_rate_pct: number;
    latency_ms: {
      avg: number;
      p50: number;
      p95: number;
      p99: number;
      max: number;
    };
    routes: TelemetryRouteStat[];
  };
  errors_total: number;
  thumbnails: {
    total_requests: number;
    cache_hits: number;
    cache_misses: number;
    hit_ratio_pct: number;
    avg_generate_ms: number;
  };
  slow_operations: TelemetrySlowOperation[];
  timeseries?: TelemetryTimeseriesPoint[];
};

export type TelemetryErrorRecord = {
  id: number;
  timestamp: string;
  trace_id: string | null;
  source: string;
  error_type: string;
  message: string;
  stack_trace: string | null;
  context: Record<string, unknown> | null;
};

export type TelemetryEventItem = {
  kind: "error" | "timing" | "breadcrumb";
  trace_id?: string;
  name: string;
  duration_ms?: number;
  error_type?: string;
  message?: string;
  stack_trace?: string;
  metadata?: Record<string, unknown>;
};

export type TelemetryEventsBatchPayload = {
  events: TelemetryEventItem[];
};


export type ApiConfig = {
  baseUrl: string;
  token?: string;
  allowQueryToken?: boolean;
  getTraceId?: () => string | null;
};

export class TagStudioApiClient {
  readonly baseUrl: string;
  private readonly token?: string;
  private readonly allowQueryToken: boolean;
  private readonly getTraceId?: () => string | null;

  constructor(config: ApiConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.token = config.token;
    this.allowQueryToken = config.allowQueryToken ?? false;
    this.getTraceId = config.getTraceId;
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

  async getTagColors(): Promise<TagColorNamespaceResponse[]> {
    return this.request("/api/v1/tag-colors");
  }

  async getTags(query?: string, limit?: number, parentForTagId?: number): Promise<TagResponse[]> {
    const params = new URLSearchParams();
    if (query?.trim()) {
      params.set("query", query.trim());
    }
    if (typeof limit === "number") {
      params.set("limit", String(limit));
    }
    if (typeof parentForTagId === "number") {
      params.set("parent_for_tag_id", String(parentForTagId));
    }
    const suffix = params.size > 0 ? `?${params}` : "";
    return this.request(`/api/v1/tags${suffix}`);
  }

  async searchTags(
    params: {
      query?: string;
      limit?: number;
      offset?: number;
      parentForTagId?: number;
    } = {}
  ): Promise<TagSearchResponse> {
    const searchParams = new URLSearchParams();
    if (params.query?.trim()) {
      searchParams.set("query", params.query.trim());
    }
    if (typeof params.limit === "number") {
      searchParams.set("limit", String(params.limit));
    }
    if (typeof params.offset === "number") {
      searchParams.set("offset", String(params.offset));
    }
    if (typeof params.parentForTagId === "number") {
      searchParams.set("parent_for_tag_id", String(params.parentForTagId));
    }
    const suffix = searchParams.size > 0 ? `?${searchParams}` : "";
    try {
      return await this.request(`/api/v1/tags/search${suffix}`);
    } catch (error) {
      // Compatibility fallback for older servers that do not expose /tags/search yet.
      if (!(error instanceof Error) || !error.message.includes("(404)")) {
        throw error;
      }

      const legacyTags = await this.getTags(params.query, -1, params.parentForTagId);
      const offset = Math.max(0, params.offset ?? 0);
      const limit = Math.max(1, params.limit ?? legacyTags.length);
      const items = legacyTags.slice(offset, offset + limit);
      return {
        items,
        total_count: legacyTags.length,
        offset,
        limit,
        has_more: offset + items.length < legacyTags.length
      };
    }
  }

  async getTagStats(coOccurrencesLimit?: number): Promise<TagStatsResponse> {
    const params = new URLSearchParams();
    if (typeof coOccurrencesLimit === "number") {
      params.set("co_occurrences_limit", String(coOccurrencesLimit));
    }
    const suffix = params.size > 0 ? `?${params}` : "";
    return this.request(`/api/v1/tags/stats${suffix}`);
  }

  async getSuggestedTags(payload: TagSuggestionsRequest): Promise<TagSuggestionsResponse> {
    return this.request("/api/v1/tags/suggested", {
      method: "POST",
      body: JSON.stringify(payload)
    });
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

  async createTag(payload: TagCreatePayload): Promise<TagResponse> {
    return this.request("/api/v1/tags", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  async updateTag(tagId: number, payload: TagUpdatePayload): Promise<TagResponse> {
    return this.request(`/api/v1/tags/${tagId}`, {
      method: "PATCH",
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

  async trashEntries(entryIds: number[]): Promise<TrashEntriesResponse> {
    return this.request("/api/v1/entries:trash", {
      method: "POST",
      body: JSON.stringify({ entry_ids: entryIds })
    });
  }

  async openEntries(entryIds: number[]): Promise<OpenEntriesResponse> {
    return this.request("/api/v1/entries:open", {
      method: "POST",
      body: JSON.stringify({ entry_ids: entryIds })
    });
  }

  async revealEntry(entryId: number): Promise<{ success: boolean }> {
    return this.request("/api/v1/entries:reveal", {
      method: "POST",
      body: JSON.stringify({ entry_id: entryId })
    });
  }

  async startRefreshJob(): Promise<JobCreateResponse> {
    return this.request("/api/v1/jobs/refresh", {
      method: "POST"
    });
  }

  async startRemuxJob(): Promise<JobCreateResponse> {
    return this.request("/api/v1/jobs/remux", {
      method: "POST"
    });
  }

  async checkRemux(): Promise<RemuxCheckResponse> {
    return this.request("/api/v1/jobs/remux:check", {
      method: "POST"
    });
  }

  async getRemuxBackups(): Promise<RemuxBackupInfoResponse> {
    return this.request("/api/v1/remux/backups");
  }

  async purgeRemuxBackups(): Promise<RemuxPurgeResponse> {
    return this.request("/api/v1/remux/purge-backups", {
      method: "POST"
    });
  }

  async syncSystemTags(): Promise<SystemTagsSyncResponse> {
    return this.request("/api/v1/system-tags:sync", {
      method: "POST"
    });
  }

  async getJob(jobId: string): Promise<JobStatusResponse> {
    return this.request(`/api/v1/jobs/${jobId}`);
  }

  getJobEventsUrl(jobId: string): string {
    return this.resolveUrl(`/api/v1/jobs/${jobId}/events`);
  }

  async getTelemetrySummary(windowSeconds?: number): Promise<TelemetrySummaryResponse> {
    const params = new URLSearchParams();
    if (typeof windowSeconds === "number") {
      params.set("window_seconds", String(windowSeconds));
    }
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    return this.request(`/api/v1/telemetry/summary${suffix}`);
  }

  async getTelemetryErrors(limit?: number): Promise<TelemetryErrorRecord[]> {
    const params = new URLSearchParams();
    if (typeof limit === "number") {
      params.set("limit", String(limit));
    }
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    return this.request(`/api/v1/telemetry/errors${suffix}`);
  }

  async getTelemetryLogs(
    params: { limit?: number; level?: string; query?: string } = {}
  ): Promise<Record<string, unknown>[]> {
    const searchParams = new URLSearchParams();
    if (typeof params.limit === "number") {
      searchParams.set("limit", String(params.limit));
    }
    if (params.level) {
      searchParams.set("level", params.level);
    }
    if (params.query) {
      searchParams.set("query", params.query);
    }
    const suffix = searchParams.size > 0 ? `?${searchParams.toString()}` : "";
    return this.request(`/api/v1/telemetry/logs${suffix}`);
  }

  async postTelemetryEvents(
    payload: TelemetryEventsBatchPayload
  ): Promise<{ success: boolean; ingested: number }> {
    return this.request("/api/v1/telemetry/events", {
      method: "POST",
      body: JSON.stringify(payload)
    });
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
    const traceId = this.getTraceId?.();
    if (traceId && !headers.has("x-trace-id")) {
      headers.set("x-trace-id", traceId);
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
    if (!this.allowQueryToken || !this.token) {
      return url;
    }
    if (!url.searchParams.has("token")) {
      // EventSource and direct media URLs may not carry custom auth headers.
      url.searchParams.set("token", this.token);
    }
    return url;
  }
}

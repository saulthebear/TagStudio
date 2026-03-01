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

export type SearchRequest = {
  query?: string;
  page_index?: number;
  page_size?: number;
  sorting_mode?: "file.date_added" | "generic.filename" | "file.path" | "sorting.mode.random";
  ascending?: boolean;
  show_hidden_entries?: boolean;
};

export type SearchResponse = {
  total_count: number;
  ids: number[];
  entries: EntrySummaryResponse[];
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

  async search(payload: SearchRequest): Promise<SearchResponse> {
    return this.request("/api/v1/search", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  async getEntry(entryId: number): Promise<EntryResponse> {
    return this.request(`/api/v1/entries/${entryId}`);
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
      const detail = await response.text();
      throw new Error(`API request failed (${response.status}): ${detail}`);
    }

    return (await response.json()) as T;
  }
}

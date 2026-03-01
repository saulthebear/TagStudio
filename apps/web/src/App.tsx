import { type MutableRefObject, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  type EntryResponse,
  type JobEventPayload,
  type PreviewResponse,
  type SearchResponse,
  type SortingMode
} from "@tagstudio/api-client";
import { Button } from "@tagstudio/ui";

import { api } from "@/lib/client";

const SORTING_OPTIONS: Array<{ label: string; value: SortingMode }> = [
  { label: "Date Added", value: "file.date_added" },
  { label: "Filename", value: "generic.filename" },
  { label: "Path", value: "file.path" },
  { label: "Random", value: "sorting.mode.random" }
];

export function App() {
  const queryClient = useQueryClient();
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const eventStreamRef = useRef<EventSource | null>(null);

  const canPickDirectory = typeof window.tagstudioNative?.pickDirectory === "function";
  const [libraryPath, setLibraryPath] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [sortingMode, setSortingMode] = useState<SortingMode>("file.date_added");
  const [ascending, setAscending] = useState(true);
  const [showHiddenEntries, setShowHiddenEntries] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(200);
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<EntryResponse | null>(null);
  const [fieldDrafts, setFieldDrafts] = useState<Record<string, string>>({});
  const [selectedTagId, setSelectedTagId] = useState<string>("");
  const [tagQuery, setTagQuery] = useState("");
  const [newFieldKey, setNewFieldKey] = useState("");
  const [newFieldValue, setNewFieldValue] = useState("");
  const [refreshStatus, setRefreshStatus] = useState<JobEventPayload | null>(null);
  const [uiError, setUiError] = useState<string | null>(null);
  const [autoplay, setAutoplay] = useState(false);
  const [loop, setLoop] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);

  const health = useQuery({
    queryKey: ["health"],
    queryFn: () => api.health(),
    refetchInterval: 30000
  });

  const libraryState = useQuery({
    queryKey: ["library-state"],
    queryFn: () => api.getLibraryState(),
    refetchInterval: 3000
  });

  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.getSettings()
  });

  const fieldTypes = useQuery({
    queryKey: ["field-types", libraryState.data?.library_path],
    queryFn: () => api.getFieldTypes(),
    enabled: libraryState.data?.is_open === true
  });

  const tags = useQuery({
    queryKey: ["tags", libraryState.data?.library_path, tagQuery],
    queryFn: () => api.getTags(tagQuery),
    enabled: libraryState.data?.is_open === true
  });

  const preview = useQuery<PreviewResponse>({
    queryKey: ["preview", selectedEntry?.id],
    queryFn: () => api.getPreview(selectedEntry!.id),
    enabled: selectedEntry !== null
  });

  const syncSettingsFromServer = (nextSettings: {
    sorting_mode: SortingMode;
    ascending: boolean;
    show_hidden_entries: boolean;
    page_size: number;
  }) => {
    setSortingMode(nextSettings.sorting_mode);
    setAscending(nextSettings.ascending);
    setShowHiddenEntries(nextSettings.show_hidden_entries);
    setPageSize(nextSettings.page_size);
  };

  useEffect(() => {
    if (settings.data) {
      syncSettingsFromServer(settings.data);
    }
  }, [settings.data]);

  useEffect(() => {
    const media = mediaRef.current;
    if (!media) {
      return;
    }
    media.autoplay = autoplay;
    media.loop = loop;
    media.muted = muted;
    media.volume = volume;
  }, [autoplay, loop, muted, volume, preview.data?.media_url]);

  useEffect(
    () => () => {
      eventStreamRef.current?.close();
    },
    []
  );

  const resetResults = () => {
    setResults(null);
    setSelectedEntry(null);
    setFieldDrafts({});
    setRefreshStatus(null);
  };

  const openLibrary = useMutation({
    mutationFn: (mode: "open" | "create") =>
      mode === "create"
        ? api.createLibrary({ path: libraryPath })
        : api.openLibrary({ path: libraryPath }),
    onSuccess: () => {
      setUiError(null);
      queryClient.invalidateQueries({ queryKey: ["library-state"] });
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      queryClient.invalidateQueries({ queryKey: ["field-types"] });
      queryClient.invalidateQueries({ queryKey: ["tags"] });
      resetResults();
    },
    onError: (error) => {
      setUiError(error instanceof Error ? error.message : "Failed to open library.");
    }
  });

  const runSearch = useMutation({
    mutationFn: (payload: {
      query: string;
      pageIndex: number;
      pageSize: number;
      sortingMode: SortingMode;
      ascending: boolean;
      showHiddenEntries: boolean;
    }) =>
      api.search({
        query: payload.query,
        page_index: payload.pageIndex,
        page_size: payload.pageSize,
        sorting_mode: payload.sortingMode,
        ascending: payload.ascending,
        show_hidden_entries: payload.showHiddenEntries
      }),
    onSuccess: (data) => {
      setUiError(null);
      setResults(data);
      setSelectedEntry(null);
      setFieldDrafts({});
    },
    onError: (error) => {
      setUiError(error instanceof Error ? error.message : "Search failed.");
    }
  });

  const loadEntry = useMutation({
    mutationFn: (entryId: number) => api.getEntry(entryId),
    onSuccess: (entry) => {
      setUiError(null);
      setSelectedEntry(entry);
      const drafts: Record<string, string> = {};
      for (const field of entry.fields) {
        drafts[field.type_key] = String(field.value ?? "");
      }
      setFieldDrafts(drafts);
    },
    onError: (error) => {
      setUiError(error instanceof Error ? error.message : "Unable to load entry.");
    }
  });

  const updateEntryField = useMutation({
    mutationFn: (payload: { entryId: number; fieldKey: string; value: string }) =>
      api.updateEntryField(payload.entryId, payload.fieldKey, payload.value),
    onSuccess: (entry) => {
      setUiError(null);
      setSelectedEntry(entry);
      const drafts: Record<string, string> = {};
      for (const field of entry.fields) {
        drafts[field.type_key] = String(field.value ?? "");
      }
      setFieldDrafts(drafts);
      queryClient.invalidateQueries({ queryKey: ["library-state"] });
    },
    onError: (error) => {
      setUiError(error instanceof Error ? error.message : "Failed to update field.");
    }
  });

  const addTagToEntry = useMutation({
    mutationFn: (payload: { entryId: number; tagId: number }) =>
      api.addTagsToEntries([payload.entryId], [payload.tagId]),
    onSuccess: async (_, payload) => {
      setUiError(null);
      const entry = await api.getEntry(payload.entryId);
      setSelectedEntry(entry);
      queryClient.invalidateQueries({ queryKey: ["tags"] });
      queryClient.invalidateQueries({ queryKey: ["library-state"] });
    },
    onError: (error) => {
      setUiError(error instanceof Error ? error.message : "Failed to add tag.");
    }
  });

  const removeTagFromEntry = useMutation({
    mutationFn: (payload: { entryId: number; tagId: number }) =>
      api.removeTagsFromEntries([payload.entryId], [payload.tagId]),
    onSuccess: async (_, payload) => {
      setUiError(null);
      const entry = await api.getEntry(payload.entryId);
      setSelectedEntry(entry);
      queryClient.invalidateQueries({ queryKey: ["library-state"] });
    },
    onError: (error) => {
      setUiError(error instanceof Error ? error.message : "Failed to remove tag.");
    }
  });

  const saveSettings = useMutation({
    mutationFn: () =>
      api.updateSettings({
        sorting_mode: sortingMode,
        ascending,
        show_hidden_entries: showHiddenEntries,
        page_size: pageSize
      }),
    onSuccess: (nextSettings) => {
      setUiError(null);
      syncSettingsFromServer(nextSettings);
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (error) => {
      setUiError(error instanceof Error ? error.message : "Failed to save settings.");
    }
  });

  const refreshLibrary = useMutation({
    mutationFn: () => api.startRefreshJob(),
    onSuccess: (job) => {
      setUiError(null);
      setRefreshStatus(null);
      eventStreamRef.current?.close();
      const source = new EventSource(api.getJobEventsUrl(job.job_id));
      eventStreamRef.current = source;

      const onEvent = (event: MessageEvent) => {
        const payload = JSON.parse(event.data) as JobEventPayload;
        setRefreshStatus(payload);
        if (payload.is_terminal) {
          source.close();
          queryClient.invalidateQueries({ queryKey: ["library-state"] });
        }
      };

      source.addEventListener("job.started", onEvent as EventListener);
      source.addEventListener("job.progress", onEvent as EventListener);
      source.addEventListener("job.completed", onEvent as EventListener);
      source.addEventListener("job.failed", onEvent as EventListener);

      source.onerror = () => {
        source.close();
      };
    },
    onError: (error) => {
      setUiError(error instanceof Error ? error.message : "Unable to start refresh.");
    }
  });

  const triggerSearch = (nextPageIndex: number, query = searchInput) => {
    const normalizedQuery = query.trim();
    setActiveQuery(normalizedQuery);
    setPageIndex(nextPageIndex);
    runSearch.mutate({
      query: normalizedQuery,
      pageIndex: nextPageIndex,
      pageSize,
      sortingMode,
      ascending,
      showHiddenEntries
    });
  };

  const browseDirectory = async () => {
    const picker = window.tagstudioNative?.pickDirectory;
    if (!picker) {
      return;
    }
    const selected = await picker();
    if (selected) {
      setLibraryPath(selected);
    }
  };

  const totalCount = results?.total_count ?? 0;
  const totalPages = totalCount > 0 ? Math.ceil(totalCount / pageSize) : 0;
  const canPageBack = pageIndex > 0;
  const canPageForward = totalCount > 0 && pageIndex + 1 < totalPages;
  const hasSelectedEntry = selectedEntry !== null;

  const tagsDisplay = useMemo(
    () =>
      selectedEntry?.tags
        .map((tag) => `${tag.name}${tag.shorthand ? ` (${tag.shorthand})` : ""}`)
        .join(", ") ?? "",
    [selectedEntry]
  );

  return (
    <main className="app-shell">
      <header className="panel mb-4">
        <h1 className="m-0 text-3xl font-semibold tracking-tight">TagStudio Web Foundation</h1>
        <p className="mb-0 mt-2 text-sm opacity-80">
          Browser-first renderer with a local Python API backend.
        </p>
        <p className="mb-0 mt-2 text-xs">
          API: {api.baseUrl} | Health: {health.data?.status ?? "checking..."}
        </p>
      </header>

      <section className="panel mb-4 grid gap-3 md:grid-cols-[1fr_auto_auto_auto]">
        <input
          className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm"
          placeholder="/path/to/library"
          value={libraryPath}
          onChange={(event) => setLibraryPath(event.target.value)}
        />
        <Button disabled={!canPickDirectory} variant="secondary" onClick={() => void browseDirectory()}>
          Browse...
        </Button>
        <Button disabled={!libraryPath || openLibrary.isPending} onClick={() => openLibrary.mutate("open")}>
          Open Library
        </Button>
        <Button
          disabled={!libraryPath || openLibrary.isPending}
          variant="secondary"
          onClick={() => openLibrary.mutate("create")}
        >
          Create Library
        </Button>
      </section>

      <section className="panel mb-4">
        <p className="m-0 text-sm">
          Library status: {libraryState.data?.is_open ? "open" : "closed"} | Entries:{" "}
          {libraryState.data?.entries_count ?? 0} | Tags: {libraryState.data?.tags_count ?? 0}
        </p>
      </section>

      {uiError ? (
        <section className="panel mb-4 border-red-300 bg-red-50">
          <p className="m-0 text-sm text-red-700">{uiError}</p>
        </section>
      ) : null}

      <section className="panel mb-4 grid gap-3 md:grid-cols-5">
        <input
          className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm md:col-span-3"
          placeholder='Search query (e.g. tag:"foo" or path:"*.png")'
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              triggerSearch(0);
            }
          }}
        />
        <select
          className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm"
          value={sortingMode}
          onChange={(event) => setSortingMode(event.target.value as SortingMode)}
        >
          {SORTING_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <Button
          disabled={!libraryState.data?.is_open || runSearch.isPending}
          onClick={() => triggerSearch(0)}
        >
          Search
        </Button>
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={ascending} onChange={(event) => setAscending(event.target.checked)} />
          Ascending
        </label>
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showHiddenEntries}
            onChange={(event) => setShowHiddenEntries(event.target.checked)}
          />
          Show hidden
        </label>
        <label className="inline-flex items-center gap-2 text-sm">
          <span>Page size</span>
          <input
            className="w-24 rounded-md border border-[var(--border)] bg-white px-2 py-1 text-sm"
            type="number"
            min={1}
            max={2000}
            value={pageSize}
            onChange={(event) => setPageSize(Math.max(1, Number(event.target.value) || 1))}
          />
        </label>
        <Button variant="secondary" onClick={() => saveSettings.mutate()} disabled={saveSettings.isPending}>
          Save Settings
        </Button>
        <Button
          variant="secondary"
          onClick={() => refreshLibrary.mutate()}
          disabled={!libraryState.data?.is_open || refreshLibrary.isPending}
        >
          Refresh Library
        </Button>
      </section>

      <section className="panel mb-4 flex items-center justify-between gap-2">
        <div className="text-sm">
          Query: <strong>{activeQuery || "(all entries)"}</strong> | Results: {totalCount} | Page:{" "}
          {totalPages === 0 ? 0 : pageIndex + 1}/{totalPages}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" disabled={!canPageBack} onClick={() => triggerSearch(pageIndex - 1, activeQuery)}>
            Previous
          </Button>
          <Button variant="secondary" disabled={!canPageForward} onClick={() => triggerSearch(pageIndex + 1, activeQuery)}>
            Next
          </Button>
        </div>
      </section>

      {refreshStatus ? (
        <section className="panel mb-4 text-sm">
          <strong>Refresh:</strong> {refreshStatus.status}
          {refreshStatus.message ? ` | ${refreshStatus.message}` : ""}
          {refreshStatus.progress_total
            ? ` | ${refreshStatus.progress_current}/${refreshStatus.progress_total}`
            : ""}
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-3">
        <div className="panel min-h-[280px]">
          <h2 className="mt-0 text-lg">Results</h2>
          {results ? (
            <ul className="m-0 list-none space-y-1 p-0">
              {results.entries.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    className="w-full rounded-md border border-transparent px-2 py-1 text-left text-sm hover:border-[var(--border)] hover:bg-white"
                    onClick={() => loadEntry.mutate(entry.id)}
                  >
                    {entry.path} ({entry.id})
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm opacity-75">Run a search to view matching entries.</p>
          )}
        </div>

        <div className="panel min-h-[280px]">
          <h2 className="mt-0 text-lg">Entry Detail</h2>
          {selectedEntry ? (
            <div className="space-y-2 text-sm">
              <div>
                <strong>Path:</strong> {selectedEntry.path}
              </div>
              <div>
                <strong>Tags:</strong> {tagsDisplay || "none"}
              </div>
              <div className="space-y-2">
                <strong>Tag Actions:</strong>
                <div className="flex gap-2">
                  <input
                    className="w-full rounded-md border border-[var(--border)] bg-white px-2 py-1 text-sm"
                    placeholder="Filter tags..."
                    value={tagQuery}
                    onChange={(event) => setTagQuery(event.target.value)}
                  />
                  <select
                    className="max-w-56 rounded-md border border-[var(--border)] bg-white px-2 py-1 text-sm"
                    value={selectedTagId}
                    onChange={(event) => setSelectedTagId(event.target.value)}
                  >
                    <option value="">Select tag</option>
                    {(tags.data ?? []).map((tag) => (
                      <option key={tag.id} value={String(tag.id)}>
                        {tag.name}
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="secondary"
                    disabled={!selectedTagId || addTagToEntry.isPending}
                    onClick={() =>
                      addTagToEntry.mutate({
                        entryId: selectedEntry.id,
                        tagId: Number(selectedTagId)
                      })
                    }
                  >
                    Add
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedEntry.tags.map((tag) => (
                    <button
                      key={tag.id}
                      type="button"
                      className="rounded-md border border-[var(--border)] px-2 py-1 text-xs"
                      onClick={() => removeTagFromEntry.mutate({ entryId: selectedEntry.id, tagId: tag.id })}
                    >
                      Remove {tag.name}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <strong>Fields:</strong>
                <ul className="m-0 mt-1 list-none space-y-2 p-0">
                  {selectedEntry.fields.map((field) => (
                    <li key={field.id}>
                      <div className="mb-1 font-medium">{field.type_name}</div>
                      <div className="flex gap-2">
                        <input
                          className="w-full rounded-md border border-[var(--border)] bg-white px-2 py-1 text-sm"
                          value={fieldDrafts[field.type_key] ?? ""}
                          onChange={(event) =>
                            setFieldDrafts((prev) => ({ ...prev, [field.type_key]: event.target.value }))
                          }
                        />
                        <Button
                          variant="secondary"
                          disabled={updateEntryField.isPending}
                          onClick={() =>
                            updateEntryField.mutate({
                              entryId: selectedEntry.id,
                              fieldKey: field.type_key,
                              value: fieldDrafts[field.type_key] ?? ""
                            })
                          }
                        >
                          Save
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="space-y-1">
                <strong>Add/Update Field:</strong>
                <div className="flex gap-2">
                  <select
                    className="rounded-md border border-[var(--border)] bg-white px-2 py-1 text-sm"
                    value={newFieldKey}
                    onChange={(event) => setNewFieldKey(event.target.value)}
                  >
                    <option value="">Select field type</option>
                    {(fieldTypes.data ?? []).map((fieldType) => (
                      <option key={fieldType.key} value={fieldType.key}>
                        {fieldType.name}
                      </option>
                    ))}
                  </select>
                  <input
                    className="w-full rounded-md border border-[var(--border)] bg-white px-2 py-1 text-sm"
                    value={newFieldValue}
                    onChange={(event) => setNewFieldValue(event.target.value)}
                    placeholder="Field value"
                  />
                  <Button
                    variant="secondary"
                    disabled={!newFieldKey || updateEntryField.isPending}
                    onClick={() =>
                      updateEntryField.mutate({
                        entryId: selectedEntry.id,
                        fieldKey: newFieldKey,
                        value: newFieldValue
                      })
                    }
                  >
                    Apply
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm opacity-75">Select a result to inspect tags and fields.</p>
          )}
        </div>

        <div className="panel min-h-[280px]">
          <h2 className="mt-0 text-lg">Preview</h2>
          {!hasSelectedEntry ? <p className="text-sm opacity-75">Select an entry to render preview.</p> : null}
          {hasSelectedEntry && preview.data?.preview_kind === "image" ? (
            <img
              src={api.getMediaUrl(selectedEntry!.id)}
              alt={selectedEntry!.filename}
              className="max-h-[420px] max-w-full rounded-md border border-[var(--border)] object-contain"
            />
          ) : null}
          {hasSelectedEntry && preview.data?.preview_kind === "video" ? (
            <div className="space-y-2">
              <video
                ref={(element) => {
                  mediaRef.current = element;
                }}
                src={api.getMediaUrl(selectedEntry!.id)}
                controls
                className="max-h-[280px] w-full rounded-md border border-[var(--border)]"
              />
              <MediaControls
                mediaRef={mediaRef}
                autoplay={autoplay}
                loop={loop}
                muted={muted}
                volume={volume}
                setAutoplay={setAutoplay}
                setLoop={setLoop}
                setMuted={setMuted}
                setVolume={setVolume}
              />
            </div>
          ) : null}
          {hasSelectedEntry && preview.data?.preview_kind === "audio" ? (
            <div className="space-y-2">
              <audio
                ref={(element) => {
                  mediaRef.current = element;
                }}
                src={api.getMediaUrl(selectedEntry!.id)}
                controls
                className="w-full"
              />
              <MediaControls
                mediaRef={mediaRef}
                autoplay={autoplay}
                loop={loop}
                muted={muted}
                volume={volume}
                setAutoplay={setAutoplay}
                setLoop={setLoop}
                setMuted={setMuted}
                setVolume={setVolume}
              />
            </div>
          ) : null}
          {hasSelectedEntry && preview.data?.preview_kind === "text" ? (
            <pre className="max-h-[320px] overflow-auto rounded-md border border-[var(--border)] bg-white p-2 text-xs">
              {preview.data.text_excerpt || "(empty text)"}
            </pre>
          ) : null}
          {hasSelectedEntry &&
          preview.data &&
          (preview.data.preview_kind === "binary" || preview.data.preview_kind === "missing") ? (
            <p className="text-sm opacity-75">
              {preview.data.preview_kind === "missing"
                ? preview.data.text_excerpt
                : "Preview not available for this file type."}
            </p>
          ) : null}
        </div>
      </section>
    </main>
  );
}

type MediaControlsProps = {
  mediaRef: MutableRefObject<HTMLMediaElement | null>;
  autoplay: boolean;
  loop: boolean;
  muted: boolean;
  volume: number;
  setAutoplay: (value: boolean) => void;
  setLoop: (value: boolean) => void;
  setMuted: (value: boolean) => void;
  setVolume: (value: number) => void;
};

function MediaControls({
  mediaRef,
  autoplay,
  loop,
  muted,
  volume,
  setAutoplay,
  setLoop,
  setMuted,
  setVolume
}: MediaControlsProps) {
  const play = () => {
    void mediaRef.current?.play();
  };
  const pause = () => {
    mediaRef.current?.pause();
  };
  const seekBy = (seconds: number) => {
    if (!mediaRef.current) {
      return;
    }
    mediaRef.current.currentTime = Math.max(0, mediaRef.current.currentTime + seconds);
  };

  return (
    <div className="space-y-2 text-xs">
      <div className="flex gap-2">
        <Button variant="secondary" onClick={play}>
          Play
        </Button>
        <Button variant="secondary" onClick={pause}>
          Pause
        </Button>
        <Button variant="secondary" onClick={() => seekBy(-5)}>
          -5s
        </Button>
        <Button variant="secondary" onClick={() => seekBy(5)}>
          +5s
        </Button>
      </div>
      <label className="inline-flex items-center gap-2">
        <input type="checkbox" checked={autoplay} onChange={(event) => setAutoplay(event.target.checked)} />
        Autoplay
      </label>
      <label className="ml-3 inline-flex items-center gap-2">
        <input type="checkbox" checked={loop} onChange={(event) => setLoop(event.target.checked)} />
        Loop
      </label>
      <label className="ml-3 inline-flex items-center gap-2">
        <input type="checkbox" checked={muted} onChange={(event) => setMuted(event.target.checked)} />
        Muted
      </label>
      <label className="ml-3 inline-flex items-center gap-2">
        Volume
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          onChange={(event) => setVolume(Number(event.target.value))}
        />
      </label>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { type EntryResponse, type JobEventPayload, type PreviewResponse, type SearchResponse, type SortingMode } from "@tagstudio/api-client";

import { EntryDetailPanel } from "@/components/EntryDetailPanel";
import { ErrorPanel } from "@/components/ErrorPanel";
import { HeaderPanel } from "@/components/HeaderPanel";
import { LibraryPanel } from "@/components/LibraryPanel";
import { LibraryStatusPanel } from "@/components/LibraryStatusPanel";
import { PaginationPanel } from "@/components/PaginationPanel";
import { PreviewPanel } from "@/components/PreviewPanel";
import { RefreshStatusPanel } from "@/components/RefreshStatusPanel";
import { ResultsPanel } from "@/components/ResultsPanel";
import { SearchControlsPanel } from "@/components/SearchControlsPanel";
import { api } from "@/lib/client";

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
  const [selectedTagId, setSelectedTagId] = useState("");
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

  const tagsDisplay = useMemo(
    () =>
      selectedEntry?.tags
        .map((tag) => `${tag.name}${tag.shorthand ? ` (${tag.shorthand})` : ""}`)
        .join(", ") ?? "",
    [selectedEntry]
  );

  return (
    <main className="app-shell">
      <HeaderPanel apiBaseUrl={api.baseUrl} healthStatus={health.data?.status} />

      <LibraryPanel
        libraryPath={libraryPath}
        canPickDirectory={canPickDirectory}
        openPending={openLibrary.isPending}
        onLibraryPathChange={setLibraryPath}
        onBrowse={() => void browseDirectory()}
        onOpen={() => openLibrary.mutate("open")}
        onCreate={() => openLibrary.mutate("create")}
      />

      <LibraryStatusPanel
        isOpen={libraryState.data?.is_open === true}
        entriesCount={libraryState.data?.entries_count ?? 0}
        tagsCount={libraryState.data?.tags_count ?? 0}
      />

      {uiError ? <ErrorPanel message={uiError} /> : null}

      <SearchControlsPanel
        searchInput={searchInput}
        sortingMode={sortingMode}
        ascending={ascending}
        showHiddenEntries={showHiddenEntries}
        pageSize={pageSize}
        isLibraryOpen={libraryState.data?.is_open === true}
        searchPending={runSearch.isPending}
        saveSettingsPending={saveSettings.isPending}
        refreshPending={refreshLibrary.isPending}
        onSearchInputChange={setSearchInput}
        onSortingModeChange={setSortingMode}
        onAscendingChange={setAscending}
        onShowHiddenChange={setShowHiddenEntries}
        onPageSizeChange={setPageSize}
        onSearch={() => triggerSearch(0)}
        onSaveSettings={() => saveSettings.mutate()}
        onRefresh={() => refreshLibrary.mutate()}
      />

      <PaginationPanel
        activeQuery={activeQuery}
        totalCount={totalCount}
        pageIndex={pageIndex}
        totalPages={totalPages}
        canPageBack={canPageBack}
        canPageForward={canPageForward}
        onPrevious={() => triggerSearch(pageIndex - 1, activeQuery)}
        onNext={() => triggerSearch(pageIndex + 1, activeQuery)}
      />

      {refreshStatus ? <RefreshStatusPanel refreshStatus={refreshStatus} /> : null}

      <section className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-4"><ResultsPanel results={results} onSelectEntry={(entryId) => loadEntry.mutate(entryId)} /></div>

        <div className="lg:col-span-4"><EntryDetailPanel
          selectedEntry={selectedEntry}
          tagsDisplay={tagsDisplay}
          tagQuery={tagQuery}
          selectedTagId={selectedTagId}
          fieldDrafts={fieldDrafts}
          newFieldKey={newFieldKey}
          newFieldValue={newFieldValue}
          availableTags={tags.data ?? []}
          fieldTypes={fieldTypes.data ?? []}
          addTagPending={addTagToEntry.isPending}
          updateFieldPending={updateEntryField.isPending}
          onTagQueryChange={setTagQuery}
          onSelectedTagChange={setSelectedTagId}
          onAddTag={() => {
            if (!selectedEntry || !selectedTagId) {
              return;
            }
            addTagToEntry.mutate({ entryId: selectedEntry.id, tagId: Number(selectedTagId) });
          }}
          onRemoveTag={(tagId) => {
            if (!selectedEntry) {
              return;
            }
            removeTagFromEntry.mutate({ entryId: selectedEntry.id, tagId });
          }}
          onFieldDraftChange={(fieldKey, value) =>
            setFieldDrafts((prev) => ({
              ...prev,
              [fieldKey]: value
            }))
          }
          onSaveField={(fieldKey, value) => {
            if (!selectedEntry) {
              return;
            }
            updateEntryField.mutate({ entryId: selectedEntry.id, fieldKey, value });
          }}
          onNewFieldKeyChange={setNewFieldKey}
          onNewFieldValueChange={setNewFieldValue}
          onApplyField={() => {
            if (!selectedEntry || !newFieldKey) {
              return;
            }
            updateEntryField.mutate({
              entryId: selectedEntry.id,
              fieldKey: newFieldKey,
              value: newFieldValue
            });
          }}
        />
        </div>

        <div className="lg:col-span-4"><PreviewPanel
          selectedEntry={selectedEntry}
          preview={preview.data}
          mediaRef={mediaRef}
          autoplay={autoplay}
          loop={loop}
          muted={muted}
          volume={volume}
          onAutoplayChange={setAutoplay}
          onLoopChange={setLoop}
          onMutedChange={setMuted}
          onVolumeChange={setVolume}
          getMediaUrl={(entryId) => api.getMediaUrl(entryId)}
        />
        </div>
      </section>
    </main>
  );
}

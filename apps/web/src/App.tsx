import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  type EntryResponse,
  type EntrySummaryResponse,
  type JobEventPayload,
  type LayoutSettings,
  type LayoutSettingsUpdateRequest,
  type PreviewResponse,
  type SortingMode
} from "@tagstudio/api-client";

import { ErrorPanel } from "@/components/ErrorPanel";
import { InspectorPane } from "@/components/InspectorPane";
import { LibraryGate } from "@/components/LibraryGate";
import { LibrarySwitcherModal } from "@/components/LibrarySwitcherModal";
import { RefreshStatusPanel } from "@/components/RefreshStatusPanel";
import { SettingsModal } from "@/components/SettingsModal";
import { SplitPane, type SplitPaneState } from "@/components/SplitPane";
import { ThumbnailGridPane } from "@/components/ThumbnailGridPane";
import { TopFilterBar } from "@/components/TopFilterBar";
import { api } from "@/api/client";

type MobilePane = "grid" | "preview" | "metadata";

type SearchOverrides = {
  sortingMode?: SortingMode;
  ascending?: boolean;
  showHiddenEntries?: boolean;
  pageSize?: number;
};

type SettingsDraft = {
  sortingMode: SortingMode;
  ascending: boolean;
  showHiddenEntries: boolean;
  pageSize: number;
};

const DEFAULT_MAIN_SPLIT: SplitPaneState = {
  ratio: 0.78,
  lastOpenRatio: 0.78,
  primaryCollapsed: false,
  secondaryCollapsed: false
};

const DEFAULT_INSPECTOR_SPLIT: SplitPaneState = {
  ratio: 0.52,
  lastOpenRatio: 0.52,
  primaryCollapsed: false,
  secondaryCollapsed: false
};

const DEFAULT_DRAFT: SettingsDraft = {
  sortingMode: "file.date_added",
  ascending: false,
  showHiddenEntries: false,
  pageSize: 200
};

function dedupeEntries(entries: EntrySummaryResponse[]): EntrySummaryResponse[] {
  const seen = new Set<number>();
  const deduped: EntrySummaryResponse[] = [];
  for (const entry of entries) {
    if (!seen.has(entry.id)) {
      seen.add(entry.id);
      deduped.push(entry);
    }
  }
  return deduped;
}

function layoutToMainSplit(layout: LayoutSettings | undefined): SplitPaneState {
  if (!layout) {
    return DEFAULT_MAIN_SPLIT;
  }
  return {
    ratio: layout.main_split_ratio,
    lastOpenRatio: layout.main_last_open_ratio,
    primaryCollapsed: layout.main_left_collapsed,
    secondaryCollapsed: layout.main_right_collapsed
  };
}

function layoutToInspectorSplit(layout: LayoutSettings | undefined): SplitPaneState {
  if (!layout) {
    return DEFAULT_INSPECTOR_SPLIT;
  }
  return {
    ratio: layout.inspector_split_ratio,
    lastOpenRatio: layout.inspector_last_open_ratio,
    primaryCollapsed: layout.preview_collapsed,
    secondaryCollapsed: layout.metadata_collapsed
  };
}

function buildLayoutUpdate(
  main: SplitPaneState,
  inspector: SplitPaneState,
  mobileActivePane: MobilePane
): LayoutSettingsUpdateRequest {
  return {
    main_split_ratio: main.ratio,
    main_last_open_ratio: main.lastOpenRatio,
    main_left_collapsed: main.primaryCollapsed,
    main_right_collapsed: main.secondaryCollapsed,
    inspector_split_ratio: inspector.ratio,
    inspector_last_open_ratio: inspector.lastOpenRatio,
    preview_collapsed: inspector.primaryCollapsed,
    metadata_collapsed: inspector.secondaryCollapsed,
    mobile_active_pane: mobileActivePane
  };
}

export function App() {
  const queryClient = useQueryClient();
  const eventStreamRef = useRef<EventSource | null>(null);
  const searchRequestIdRef = useRef(0);
  const lastLibraryModalTriggerRef = useRef<HTMLElement | null>(null);

  const canPickDirectory = typeof window.tagstudioNative?.pickDirectory === "function";

  const [libraryPath, setLibraryPath] = useState("");
  const [activeLibraryPath, setActiveLibraryPath] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [sortingMode, setSortingMode] = useState<SortingMode>(DEFAULT_DRAFT.sortingMode);
  const [ascending, setAscending] = useState(DEFAULT_DRAFT.ascending);
  const [showHiddenEntries, setShowHiddenEntries] = useState(DEFAULT_DRAFT.showHiddenEntries);
  const [pageSize, setPageSize] = useState(DEFAULT_DRAFT.pageSize);

  const [entries, setEntries] = useState<EntrySummaryResponse[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [nextPageIndex, setNextPageIndex] = useState(0);
  const [searchPending, setSearchPending] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [selectedEntry, setSelectedEntry] = useState<EntryResponse | null>(null);
  const [fieldDrafts, setFieldDrafts] = useState<Record<string, string>>({});
  const [selectedTagId, setSelectedTagId] = useState("");
  const [tagQuery, setTagQuery] = useState("");
  const [newFieldKey, setNewFieldKey] = useState("");
  const [newFieldValue, setNewFieldValue] = useState("");

  const [refreshStatus, setRefreshStatus] = useState<JobEventPayload | null>(null);
  const [uiError, setUiError] = useState<string | null>(null);

  const [mainSplitState, setMainSplitState] = useState<SplitPaneState>(DEFAULT_MAIN_SPLIT);
  const [inspectorSplitState, setInspectorSplitState] = useState<SplitPaneState>(
    DEFAULT_INSPECTOR_SPLIT
  );
  const [mobileActivePane, setMobileActivePane] = useState<MobilePane>("grid");

  const [libraryModalOpen, setLibraryModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<SettingsDraft>(DEFAULT_DRAFT);
  const [settingsHydrated, setSettingsHydrated] = useState(false);
  const [needsInitialSearch, setNeedsInitialSearch] = useState(false);

  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);

  const isLibraryOpen = activeLibraryPath !== null;

  useEffect(() => {
    const onResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(
    () => () => {
      eventStreamRef.current?.close();
    },
    []
  );

  useEffect(() => {
    if (!libraryModalOpen && !settingsOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      if (settingsOpen) {
        setSettingsOpen(false);
      }
      if (libraryModalOpen) {
        setLibraryModalOpen(false);
        lastLibraryModalTriggerRef.current?.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [libraryModalOpen, settingsOpen]);

  const libraryState = useQuery({
    queryKey: ["library-state"],
    queryFn: () => api.getLibraryState(),
    refetchInterval: 3000
  });

  const memoizedSettingsQueryKey = useMemo(
    () => ["settings", activeLibraryPath] as const,
    [activeLibraryPath]
  );

  const settings = useQuery({
    queryKey: memoizedSettingsQueryKey,
    queryFn: () => api.getSettings(),
    enabled: isLibraryOpen
  });

  const fieldTypes = useQuery({
    queryKey: ["field-types", activeLibraryPath],
    queryFn: () => api.getFieldTypes(),
    enabled: isLibraryOpen
  });

  const tags = useQuery({
    queryKey: ["tags", activeLibraryPath, tagQuery],
    queryFn: () => api.getTags(tagQuery),
    enabled: isLibraryOpen
  });

  const preview = useQuery<PreviewResponse>({
    queryKey: ["preview", selectedEntry?.id],
    queryFn: () => api.getPreview(selectedEntry!.id),
    enabled: selectedEntry !== null
  });

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
      setLibraryModalOpen(false);
      lastLibraryModalTriggerRef.current?.focus();
    },
    onError: (error) => {
      setUiError(error instanceof Error ? error.message : "Failed to open library.");
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
    mutationFn: (draft: SettingsDraft) =>
      api.updateSettings({
        sorting_mode: draft.sortingMode,
        ascending: draft.ascending,
        show_hidden_entries: draft.showHiddenEntries,
        page_size: draft.pageSize
      }),
    onSuccess: (nextSettings) => {
      setUiError(null);
      queryClient.setQueryData(memoizedSettingsQueryKey, nextSettings);
      setSortingMode(nextSettings.sorting_mode);
      setAscending(nextSettings.ascending);
      setShowHiddenEntries(nextSettings.show_hidden_entries);
      setPageSize(nextSettings.page_size);
      setSettingsDraft({
        sortingMode: nextSettings.sorting_mode,
        ascending: nextSettings.ascending,
        showHiddenEntries: nextSettings.show_hidden_entries,
        pageSize: nextSettings.page_size
      });
      setSettingsOpen(false);
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
          void executeSearch({ query: activeQuery, pageIndex: 0, append: false });
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

  useEffect(() => {
    const currentPath = libraryState.data?.is_open ? (libraryState.data.library_path ?? null) : null;
    if (currentPath === activeLibraryPath) {
      return;
    }

    setActiveLibraryPath(currentPath);
    setSettingsHydrated(false);
    setNeedsInitialSearch(currentPath !== null);
    setEntries([]);
    setTotalCount(0);
    setNextPageIndex(0);
    setSearchInput("");
    setActiveQuery("");
    setSelectedEntry(null);
    setFieldDrafts({});
    setRefreshStatus(null);
    if (currentPath) {
      setLibraryPath(currentPath);
    }
  }, [activeLibraryPath, libraryState.data?.is_open, libraryState.data?.library_path]);

  useEffect(() => {
    if (!settings.data) {
      return;
    }

    setSortingMode(settings.data.sorting_mode);
    setAscending(settings.data.ascending);
    setShowHiddenEntries(settings.data.show_hidden_entries);
    setPageSize(settings.data.page_size);
    setSettingsDraft({
      sortingMode: settings.data.sorting_mode,
      ascending: settings.data.ascending,
      showHiddenEntries: settings.data.show_hidden_entries,
      pageSize: settings.data.page_size
    });
    setMainSplitState(layoutToMainSplit(settings.data.layout));
    setInspectorSplitState(layoutToInspectorSplit(settings.data.layout));
    setMobileActivePane(settings.data.layout.mobile_active_pane);
    setSettingsHydrated(true);
  }, [settings.data]);

  const executeSearch = async ({
    query,
    pageIndex,
    append,
    sortingMode: sortingModeOverride,
    ascending: ascendingOverride,
    showHiddenEntries: showHiddenOverride,
    pageSize: pageSizeOverride
  }: {
    query: string;
    pageIndex: number;
    append: boolean;
  } & SearchOverrides) => {
    if (!isLibraryOpen) {
      return;
    }

    if (append && (loadingMore || searchPending)) {
      return;
    }

    const normalizedQuery = query.trim();
    const requestId = ++searchRequestIdRef.current;

    if (append) {
      setLoadingMore(true);
    } else {
      setSearchPending(true);
    }

    try {
      const data = await api.search({
        query: normalizedQuery,
        page_index: pageIndex,
        page_size: pageSizeOverride ?? pageSize,
        sorting_mode: sortingModeOverride ?? sortingMode,
        ascending: ascendingOverride ?? ascending,
        show_hidden_entries: showHiddenOverride ?? showHiddenEntries
      });

      if (requestId !== searchRequestIdRef.current) {
        return;
      }

      setUiError(null);
      setActiveQuery(normalizedQuery);
      setTotalCount(data.total_count);
      setNextPageIndex(pageIndex + 1);

      if (append) {
        setEntries((prev) => dedupeEntries([...prev, ...data.entries]));
      } else {
        setEntries(data.entries);
        setSelectedEntry((prev) => {
          if (!prev) {
            return null;
          }
          return data.entries.some((entry) => entry.id === prev.id) ? prev : null;
        });
      }
    } catch (error) {
      if (requestId !== searchRequestIdRef.current) {
        return;
      }
      setUiError(error instanceof Error ? error.message : "Search failed.");
    } finally {
      if (requestId !== searchRequestIdRef.current) {
        return;
      }
      setSearchPending(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    if (!isLibraryOpen || !needsInitialSearch) {
      return;
    }

    if (!settingsHydrated && settings.isFetching) {
      return;
    }

    void executeSearch({ query: "", pageIndex: 0, append: false });
    setNeedsInitialSearch(false);
  }, [
    executeSearch,
    isLibraryOpen,
    needsInitialSearch,
    settings.isFetching,
    settingsHydrated
  ]);

  const layoutUpdate = useMemo(
    () => buildLayoutUpdate(mainSplitState, inspectorSplitState, mobileActivePane),
    [inspectorSplitState, mainSplitState, mobileActivePane]
  );

  useEffect(() => {
    if (!isLibraryOpen || !settingsHydrated) {
      return;
    }

    let cancelled = false;
    const timeout = window.setTimeout(() => {
      void api
        .updateSettings({ layout: layoutUpdate })
        .then((nextSettings) => {
          if (cancelled) {
            return;
          }
          queryClient.setQueryData(memoizedSettingsQueryKey, nextSettings);
        })
        .catch((error) => {
          if (cancelled) {
            return;
          }
          setUiError(
            error instanceof Error ? error.message : "Failed to persist panel layout."
          );
        });
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [
    isLibraryOpen,
    layoutUpdate,
    memoizedSettingsQueryKey,
    queryClient,
    settingsHydrated
  ]);

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

  const openLibraryModal = () => {
    lastLibraryModalTriggerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setLibraryModalOpen(true);
  };

  const closeLibraryModal = () => {
    setLibraryModalOpen(false);
    lastLibraryModalTriggerRef.current?.focus();
  };

  const tagsDisplay = useMemo(
    () =>
      selectedEntry?.tags
        .map((tag) => `${tag.name}${tag.shorthand ? ` (${tag.shorthand})` : ""}`)
        .join(", ") ?? "",
    [selectedEntry]
  );

  const hasMore = entries.length < totalCount;

  const gridPane = (
    <ThumbnailGridPane
      entries={entries}
      totalCount={totalCount}
      selectedEntryId={selectedEntry?.id ?? null}
      activeQuery={activeQuery}
      searchPending={searchPending}
      loadingMore={loadingMore}
      hasMore={hasMore}
      onLoadMore={() =>
        void executeSearch({ query: activeQuery, pageIndex: nextPageIndex, append: true })
      }
      onSelectEntry={(entryId) => {
        loadEntry.mutate(entryId);
        if (isMobile) {
          setMobileActivePane("preview");
        }
      }}
      getMediaUrl={(entryId) => api.getMediaUrl(entryId)}
    />
  );

  const inspectorPane = (
    <InspectorPane
      selectedEntry={selectedEntry}
      preview={preview.data}
      getMediaUrl={(entryId) => api.getMediaUrl(entryId)}
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
      splitState={inspectorSplitState}
      onSplitStateChange={setInspectorSplitState}
      disableSplit={isMobile}
      mobileSection={mobileActivePane === "metadata" ? "metadata" : "preview"}
    />
  );

  return (
    <main className="app-shell app-shell-live">
      {uiError ? <ErrorPanel message={uiError} /> : null}

      {!isLibraryOpen ? (
        <LibraryGate
          libraryPath={libraryPath}
          canPickDirectory={canPickDirectory}
          openPending={openLibrary.isPending}
          onLibraryPathChange={setLibraryPath}
          onBrowse={() => void browseDirectory()}
          onOpen={() => openLibrary.mutate("open")}
          onCreate={() => openLibrary.mutate("create")}
        />
      ) : (
        <>
          <TopFilterBar
            libraryPath={activeLibraryPath ?? ""}
            searchInput={searchInput}
            activeQuery={activeQuery}
            sortingMode={sortingMode}
            ascending={ascending}
            showHiddenEntries={showHiddenEntries}
            totalCount={totalCount}
            searchPending={searchPending}
            refreshPending={refreshLibrary.isPending}
            onSearchInputChange={setSearchInput}
            onSearch={() => void executeSearch({ query: searchInput, pageIndex: 0, append: false })}
            onSortingModeChange={(nextSortingMode) => {
              setSortingMode(nextSortingMode);
              void executeSearch({
                query: activeQuery,
                pageIndex: 0,
                append: false,
                sortingMode: nextSortingMode
              });
            }}
            onAscendingChange={(nextAscending) => {
              setAscending(nextAscending);
              void executeSearch({
                query: activeQuery,
                pageIndex: 0,
                append: false,
                ascending: nextAscending
              });
            }}
            onShowHiddenChange={(nextShowHiddenEntries) => {
              setShowHiddenEntries(nextShowHiddenEntries);
              void executeSearch({
                query: activeQuery,
                pageIndex: 0,
                append: false,
                showHiddenEntries: nextShowHiddenEntries
              });
            }}
            onOpenLibraryModal={openLibraryModal}
            onRefresh={() => refreshLibrary.mutate()}
            onOpenSettings={() => {
              setSettingsDraft({
                sortingMode,
                ascending,
                showHiddenEntries,
                pageSize
              });
              setSettingsOpen(true);
            }}
          />

          {refreshStatus ? <RefreshStatusPanel refreshStatus={refreshStatus} /> : null}

          {isMobile ? (
            <section className="mobile-pane-tabs panel">
              <button
                type="button"
                className={`mobile-pane-tab ${mobileActivePane === "grid" ? "mobile-pane-tab-active" : ""}`}
                onClick={() => setMobileActivePane("grid")}
              >
                Grid
              </button>
              <button
                type="button"
                className={`mobile-pane-tab ${mobileActivePane === "preview" ? "mobile-pane-tab-active" : ""}`}
                onClick={() => setMobileActivePane("preview")}
              >
                Preview
              </button>
              <button
                type="button"
                className={`mobile-pane-tab ${mobileActivePane === "metadata" ? "mobile-pane-tab-active" : ""}`}
                onClick={() => setMobileActivePane("metadata")}
              >
                Metadata
              </button>
            </section>
          ) : null}

          <section className="content-shell">
            {isMobile ? (
              <div className="content-mobile-pane">
                {mobileActivePane === "grid" ? gridPane : inspectorPane}
              </div>
            ) : (
              <SplitPane
                orientation="horizontal"
                state={mainSplitState}
                onStateChange={setMainSplitState}
                primary={gridPane}
                secondary={inspectorPane}
                primaryLabel="File grid"
                secondaryLabel="Inspector"
                minPrimarySize={320}
                minSecondarySize={300}
                collapseThreshold={120}
                resetRatio={0.78}
                railSize={28}
                handleSize={12}
                className="main-split"
              />
            )}
          </section>
        </>
      )}

      <LibrarySwitcherModal
        open={libraryModalOpen}
        libraryPath={libraryPath}
        canPickDirectory={canPickDirectory}
        openPending={openLibrary.isPending}
        onLibraryPathChange={setLibraryPath}
        onBrowse={() => void browseDirectory()}
        onOpen={() => openLibrary.mutate("open")}
        onCreate={() => openLibrary.mutate("create")}
        onClose={closeLibraryModal}
      />

      <SettingsModal
        open={settingsOpen}
        sortingMode={settingsDraft.sortingMode}
        ascending={settingsDraft.ascending}
        showHiddenEntries={settingsDraft.showHiddenEntries}
        pageSize={settingsDraft.pageSize}
        savePending={saveSettings.isPending}
        onSortingModeChange={(value) => setSettingsDraft((prev) => ({ ...prev, sortingMode: value }))}
        onAscendingChange={(value) => setSettingsDraft((prev) => ({ ...prev, ascending: value }))}
        onShowHiddenChange={(value) =>
          setSettingsDraft((prev) => ({ ...prev, showHiddenEntries: value }))
        }
        onPageSizeChange={(value) => setSettingsDraft((prev) => ({ ...prev, pageSize: value }))}
        onSave={() => {
          setSortingMode(settingsDraft.sortingMode);
          setAscending(settingsDraft.ascending);
          setShowHiddenEntries(settingsDraft.showHiddenEntries);
          setPageSize(settingsDraft.pageSize);
          saveSettings.mutate(settingsDraft, {
            onSuccess: () => {
              void executeSearch({
                query: activeQuery,
                pageIndex: 0,
                append: false,
                sortingMode: settingsDraft.sortingMode,
                ascending: settingsDraft.ascending,
                showHiddenEntries: settingsDraft.showHiddenEntries,
                pageSize: settingsDraft.pageSize
              });
            }
          });
        }}
        onClose={() => setSettingsOpen(false)}
      />
    </main>
  );
}

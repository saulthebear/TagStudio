import {
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useState
} from "react";

import { ErrorPanel } from "@/components/ErrorPanel";
import { InspectorPane } from "@/components/InspectorPane";
import { LibraryGate } from "@/components/LibraryGate";
import { LibrarySwitcherModal } from "@/components/LibrarySwitcherModal";
import { ModalStackProvider } from "@/hooks/useModalStackDepth";
import { RefreshStatusPanel } from "@/components/RefreshStatusPanel";
import { SettingsModal } from "@/components/SettingsModal";
import { SplitPane } from "@/components/SplitPane";
import { ThumbnailGridPane } from "@/components/ThumbnailGridPane";
import { TopFilterBar } from "@/components/TopFilterBar";
import { api } from "@/api/client";
import { useInspectorWorkflow } from "@/hooks/useInspectorWorkflow";
import { useLibraryWorkflow } from "@/hooks/useLibraryWorkflow";
import { useSearchWorkflow } from "@/hooks/useSearchWorkflow";
import { useSettingsWorkflow } from "@/hooks/useSettingsWorkflow";
import {
  formatAppliedFilterSummary,
  getActiveFilterCount,
  getUntaggedTokenState,
  hasUntaggedTagConflict,
  isFlatQuery,
  toggleUntaggedInQuery
} from "@/lib/entry-filters";
import { computeDesktopSelection } from "@/lib/tag-workflows";

export function App() {
  const [uiError, setUiError] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [selectedEntryIds, setSelectedEntryIds] = useState<number[]>([]);
  const [selectionAnchorId, setSelectionAnchorId] = useState<number | null>(null);

  const onClearError = useCallback(() => {
    setUiError(null);
  }, []);

  const onError = useCallback((message: string) => {
    setUiError(message);
  }, []);

  useEffect(() => {
    const onResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const {
    libraryPath,
    setLibraryPath,
    activeLibraryPath,
    isLibraryOpen,
    libraryModalOpen,
    openPending,
    openLibrary,
    createLibrary,
    openLibraryModal,
    closeLibraryModal
  } = useLibraryWorkflow({ onError, onClearError });

  const {
    sortingMode,
    setSortingMode,
    ascending,
    setAscending,
    showHiddenEntries,
    setShowHiddenEntries,
    pageSize,
    settingsDraft,
    setSettingsDraft,
    settingsOpen,
    openSettings,
    closeSettings,
    savePending,
    saveSettingsDraft,
    mainSplitState,
    setMainSplitState,
    inspectorSplitState,
    setInspectorSplitState,
    mobileActivePane,
    setMobileActivePane,
    settingsHydrated,
    settingsFetching
  } = useSettingsWorkflow({
    activeLibraryPath,
    isLibraryOpen,
    onError,
    onClearError
  });

  const {
    searchInput,
    setSearchInput,
    activeQuery,
    entries,
    totalCount,
    hasMore,
    searchPending,
    loadingMore,
    searchResultsStale,
    markSearchResultsStale,
    executeSearch,
    searchFromInput,
    loadMore
  } = useSearchWorkflow({
    activeLibraryPath,
    isLibraryOpen,
    settingsHydrated,
    settingsFetching,
    sortingMode,
    ascending,
    showHiddenEntries,
    pageSize,
    onError,
    onClearError
  });

  const handleSearchResultsStale = useCallback(() => {
    markSearchResultsStale();
  }, [markSearchResultsStale]);

  const {
    selectedEntry,
    selectedEntryId,
    preview,
    fieldDrafts,
    setFieldDraft,
    newFieldKey,
    setNewFieldKey,
    newFieldValue,
    setNewFieldValue,
    allTags,
    fieldTypes,
    updateFieldPending,
    tagMutationPending,
    tagEditPending,
    refreshPending,
    refreshStatus,
    selectEntry,
    clearSelection,
    saveField,
    applyField,
    refreshLibrary,
    refreshSelectedEntry,
    addTagToEntries,
    removeTagFromEntries,
    createTag,
    updateTag,
    reconcileSelectionWithEntries
  } = useInspectorWorkflow({
    activeLibraryPath,
    isLibraryOpen,
    activeQuery,
    executeSearch,
    onSearchResultsStale: handleSearchResultsStale,
    onError,
    onClearError
  });

  useEffect(() => {
    setSelectedEntryIds([]);
    setSelectionAnchorId(null);
  }, [activeLibraryPath]);

  useEffect(() => {
    reconcileSelectionWithEntries(entries);

    const visibleEntryIds = new Set(entries.map((entry) => entry.id));
    setSelectedEntryIds((prev) => prev.filter((entryId) => visibleEntryIds.has(entryId)));
  }, [entries, reconcileSelectionWithEntries]);

  useEffect(() => {
    if (!settingsOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      closeSettings();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeSettings, settingsOpen]);

  const liveUntaggedState = useMemo(() => getUntaggedTokenState(searchInput), [searchInput]);
  const showUntaggedConflict = useMemo(() => hasUntaggedTagConflict(searchInput), [searchInput]);
  const showConservativeHint = useMemo(() => !isFlatQuery(searchInput), [searchInput]);
  const activeFilterCount = useMemo(
    () => getActiveFilterCount(searchInput, showHiddenEntries),
    [searchInput, showHiddenEntries]
  );
  const filterSummary = useMemo(
    () => formatAppliedFilterSummary(activeQuery, showHiddenEntries),
    [activeQuery, showHiddenEntries]
  );

  const selectedEntries = useMemo(() => {
    const selectedSet = new Set(selectedEntryIds);
    return entries.filter((entry) => selectedSet.has(entry.id));
  }, [entries, selectedEntryIds]);

  const handleSaveSettings = useCallback(() => {
    void saveSettingsDraft().then((savedDraft) => {
      if (!savedDraft) {
        return;
      }

      void executeSearch({
        query: activeQuery,
        pageIndex: 0,
        append: false,
        sortingMode: savedDraft.sortingMode,
        ascending: savedDraft.ascending,
        showHiddenEntries: savedDraft.showHiddenEntries,
        pageSize: savedDraft.pageSize
      });
    });
  }, [activeQuery, executeSearch, saveSettingsDraft]);

  const handleGridSelect = useCallback(
    (entryId: number, event: ReactMouseEvent<HTMLButtonElement>) => {
      if (isMobile) {
        setSelectedEntryIds([entryId]);
        setSelectionAnchorId(entryId);
        selectEntry(entryId);
        setMobileActivePane("preview");
        return;
      }

      const nextSelection = computeDesktopSelection({
        clickedId: entryId,
        orderedIds: entries.map((entry) => entry.id),
        selectedIds: selectedEntryIds,
        activeId: selectedEntryId,
        anchorId: selectionAnchorId,
        ctrlOrMeta: event.metaKey || event.ctrlKey,
        shift: event.shiftKey
      });

      setSelectedEntryIds(nextSelection.selectedIds);
      setSelectionAnchorId(nextSelection.anchorId);
      if (nextSelection.activeId === null) {
        clearSelection();
      } else {
        selectEntry(nextSelection.activeId);
      }
    },
    [
      clearSelection,
      entries,
      isMobile,
      selectEntry,
      selectedEntryId,
      selectedEntryIds,
      selectionAnchorId,
      setMobileActivePane
    ]
  );

  const gridPane = (
    <ThumbnailGridPane
      entries={entries}
      totalCount={totalCount}
      selectedEntryIds={selectedEntryIds}
      activeQuery={activeQuery}
      searchPending={searchPending}
      loadingMore={loadingMore}
      hasMore={hasMore}
      onLoadMore={loadMore}
      onSelectEntry={handleGridSelect}
      getThumbnailUrl={(entryId, options) => api.getThumbnailUrl(entryId, options)}
    />
  );

  const inspectorPane = (
    <InspectorPane
      selectedEntry={selectedEntry}
      selectedEntryIds={selectedEntryIds}
      selectedEntries={selectedEntries}
      preview={preview}
      getMediaUrl={(entryId) => api.getMediaUrl(entryId)}
      getThumbnailUrl={(entryId, options) => api.getThumbnailUrl(entryId, options)}
      resolveApiUrl={(path) => api.resolveUrl(path)}
      fieldDrafts={fieldDrafts}
      newFieldKey={newFieldKey}
      newFieldValue={newFieldValue}
      allTags={allTags}
      fieldTypes={fieldTypes}
      tagMutationPending={tagMutationPending}
      tagEditPending={tagEditPending}
      updateFieldPending={updateFieldPending}
      onAddTagToEntries={addTagToEntries}
      onRemoveTagFromEntries={removeTagFromEntries}
      onCreateTag={createTag}
      onUpdateTag={updateTag}
      onRefreshSelection={refreshSelectedEntry}
      onFieldDraftChange={setFieldDraft}
      onSaveField={saveField}
      onNewFieldKeyChange={setNewFieldKey}
      onNewFieldValueChange={setNewFieldValue}
      onApplyField={applyField}
      splitState={inspectorSplitState}
      onSplitStateChange={setInspectorSplitState}
      disableSplit={isMobile}
      mobileSection={mobileActivePane === "metadata" ? "metadata" : "preview"}
    />
  );

  return (
    <ModalStackProvider>
      <main className="app-shell app-shell-live">
        {uiError ? <ErrorPanel message={uiError} /> : null}

      {!isLibraryOpen ? (
        <LibraryGate
          libraryPath={libraryPath}
          openPending={openPending}
          onLibraryPathChange={setLibraryPath}
          onOpen={openLibrary}
          onCreate={createLibrary}
        />
      ) : (
        <>
          <TopFilterBar
            libraryPath={activeLibraryPath ?? ""}
            searchInput={searchInput}
            filterSummary={filterSummary}
            sortingMode={sortingMode}
            ascending={ascending}
            untaggedChecked={liveUntaggedState.positive}
            showUntaggedConflict={showUntaggedConflict}
            showConservativeHint={showConservativeHint}
            showHiddenEntries={showHiddenEntries}
            activeFilterCount={activeFilterCount}
            totalCount={totalCount}
            searchPending={searchPending}
            refreshPending={refreshPending}
            searchResultsStale={searchResultsStale}
            onSearchInputChange={setSearchInput}
            onSearch={searchFromInput}
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
            onUntaggedChange={(nextUntaggedChecked) => {
              const nextSearchInput = toggleUntaggedInQuery(searchInput, nextUntaggedChecked);
              setSearchInput(nextSearchInput);
              void executeSearch({
                query: nextSearchInput,
                pageIndex: 0,
                append: false
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
            onRefresh={refreshLibrary}
            onOpenSettings={openSettings}
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
              <div className="content-mobile-pane">{mobileActivePane === "grid" ? gridPane : inspectorPane}</div>
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
          openPending={openPending}
          onLibraryPathChange={setLibraryPath}
          onOpen={openLibrary}
          onCreate={createLibrary}
          onClose={closeLibraryModal}
        />

        <SettingsModal
          open={settingsOpen}
          sortingMode={settingsDraft.sortingMode}
          ascending={settingsDraft.ascending}
          showHiddenEntries={settingsDraft.showHiddenEntries}
          pageSize={settingsDraft.pageSize}
          savePending={savePending}
          onSortingModeChange={(value) => setSettingsDraft((prev) => ({ ...prev, sortingMode: value }))}
          onAscendingChange={(value) => setSettingsDraft((prev) => ({ ...prev, ascending: value }))}
          onShowHiddenChange={(value) =>
            setSettingsDraft((prev) => ({ ...prev, showHiddenEntries: value }))
          }
          onPageSizeChange={(value) => setSettingsDraft((prev) => ({ ...prev, pageSize: value }))}
          onSave={handleSaveSettings}
          onClose={closeSettings}
        />
      </main>
    </ModalStackProvider>
  );
}

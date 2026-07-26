import { type SortingMode, type TrashFailureReasonCode } from "@tagstudio/api-client";
import { Button } from "@tagstudio/ui";
import {
  useCallback,
  useEffect,
  useMemo,
  useState
} from "react";

import { api } from "@/api/client";
import { ErrorPanel } from "@/components/ErrorPanel";
import { FullScreenMediaView } from "@/components/FullScreenMediaView";
import { InspectorPane } from "@/components/InspectorPane";
import { LibraryGate } from "@/components/LibraryGate";
import { LibrarySwitcherModal } from "@/components/LibrarySwitcherModal";
import { RefreshStatusPanel } from "@/components/RefreshStatusPanel";
import { SettingsModal } from "@/components/SettingsModal";
import { SplitPane } from "@/components/SplitPane";
import { ThumbnailGridPane } from "@/components/ThumbnailGridPane";
import { TopFilterBar } from "@/components/TopFilterBar";
import { useAppInteractions } from "@/hooks/useAppInteractions";
import { useInspectorWorkflow } from "@/hooks/useInspectorWorkflow";
import { useLibraryWorkflow } from "@/hooks/useLibraryWorkflow";
import { ModalStackProvider } from "@/hooks/useModalStackDepth";
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

import { useTheme } from "@/hooks/useTheme";

function formatTrashFailureReason(reasonCode: TrashFailureReasonCode): string {
  switch (reasonCode) {
    case "ENTRY_NOT_FOUND":
      return "Entry no longer exists in the library.";
    case "MISSING_ON_DISK":
      return "File is missing on disk.";
    case "NOT_A_FILE":
      return "Path is not a regular file.";
    case "PERMISSION_DENIED":
      return "Permission denied while moving to Trash.";
    case "OS_ERROR":
      return "OS error while moving to Trash.";
    case "UNKNOWN_ERROR":
      return "Unknown error while moving to Trash.";
    default:
      return "Failed to move file to Trash.";
  }
}

export function App() {
  const { theme, setTheme } = useTheme();
  const [uiError, setUiError] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [videoPreviewStartsMuted, setVideoPreviewStartsMuted] = useState(true);
  const [fullScreenModalOpen, setFullScreenModalOpen] = useState(false);

  const onClearError = useCallback(() => {
    setUiError(null);
  }, []);

  const onError = useCallback((message: string) => {
    setUiError(message);
  }, []);
  const handleVideoPreviewUnmuted = useCallback(() => {
    setVideoPreviewStartsMuted(false);
  }, []);

  const toggleVideoMute = useCallback(() => {
    setVideoPreviewStartsMuted((prev) => !prev);
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
    confirmBeforeTrash,
    setConfirmBeforeTrashPreference,
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
    applyTagMutationToEntries,
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
    trashPending,
    shellActionPending,
    refreshStatus,
    selectEntry,
    clearSelection,
    saveField,
    applyField,
    refreshLibrary,
    refreshSelectedEntry,
    trashEntries,
    openEntries,
    revealEntry,
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

  const refreshVisibleEntries = useCallback(async () => {
    await executeSearch({
      query: activeQuery,
      pageIndex: 0,
      append: false
    });
  }, [activeQuery, executeSearch]);

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

  const toggleFullScreenModal = useCallback(() => {
    setFullScreenModalOpen((prev) => !prev);
  }, []);

  const {
    selectedEntryIds,
    hasPasteableTags,
    trashDialogState,
    setTrashDialogState,
    trashFailureMessagesByEntryId,
    inactiveEntryIds,
    clearTrashFailureHighlights,
    isActionBusy,
    undoState,
    runUndo,
    getContextMenuState,
    handleContextMenuOpenTarget,
    handleContextMenuAction,
    addTagsModalRequestNonce,
    confirmTrashDialog,
    pasteTagsFromMetadata,
    handleGridSelect,
    navigatePrevious,
    navigateNext,
    hasPrevious,
    hasNext
  } = useAppInteractions({
    activeLibraryPath,
    entries,
    isMobile,
    selectedEntryId,
    selectEntry,
    clearSelection,
    reconcileSelectionWithEntries,
    setMobileActivePane,
    confirmBeforeTrash,
    setConfirmBeforeTrashPreference,
    addTagToEntries,
    removeTagFromEntries,
    applyTagMutationToEntries,
    refreshVisibleEntries,
    trashEntries,
    openEntries,
    revealEntry,
    formatTrashFailureReason,
    onError,
    onClearError,
    onToggleFullScreen: toggleFullScreenModal,
    onToggleMute: toggleVideoMute,
    isFullScreenOpen: fullScreenModalOpen,
    busyFlags: {
      tagMutationPending,
      trashPending,
      shellActionPending,
      refreshPending,
      searchPending
    }
  });

  const handleToggleFavorite = useCallback(() => {
    const targetIds =
      selectedEntryIds.length > 0
        ? selectedEntryIds
        : selectedEntryId !== null
          ? [selectedEntryId]
          : [];
    if (targetIds.length > 0) {
      const state = getContextMenuState(targetIds[0]);
      handleContextMenuAction("favorite_toggle", state);
    }
  }, [getContextMenuState, handleContextMenuAction, selectedEntryId, selectedEntryIds]);

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

  const handleSearch = useCallback(() => {
    clearTrashFailureHighlights();
    searchFromInput();
  }, [clearTrashFailureHighlights, searchFromInput]);

  const handleSortingModeChange = useCallback(
    (nextSortingMode: SortingMode) => {
      clearTrashFailureHighlights();
      setSortingMode(nextSortingMode);
      void executeSearch({
        query: activeQuery,
        pageIndex: 0,
        append: false,
        sortingMode: nextSortingMode
      });
    },
    [activeQuery, clearTrashFailureHighlights, executeSearch, setSortingMode]
  );

  const handleAscendingChange = useCallback(
    (nextAscending: boolean) => {
      clearTrashFailureHighlights();
      setAscending(nextAscending);
      void executeSearch({
        query: activeQuery,
        pageIndex: 0,
        append: false,
        ascending: nextAscending
      });
    },
    [activeQuery, clearTrashFailureHighlights, executeSearch, setAscending]
  );

  const handleUntaggedChange = useCallback(
    (nextUntaggedChecked: boolean) => {
      clearTrashFailureHighlights();
      const nextSearchInput = toggleUntaggedInQuery(searchInput, nextUntaggedChecked);
      setSearchInput(nextSearchInput);
      void executeSearch({
        query: nextSearchInput,
        pageIndex: 0,
        append: false
      });
    },
    [clearTrashFailureHighlights, executeSearch, searchInput, setSearchInput]
  );

  const handleShowHiddenChange = useCallback(
    (nextShowHiddenEntries: boolean) => {
      clearTrashFailureHighlights();
      setShowHiddenEntries(nextShowHiddenEntries);
      void executeSearch({
        query: activeQuery,
        pageIndex: 0,
        append: false,
        showHiddenEntries: nextShowHiddenEntries
      });
    },
    [activeQuery, clearTrashFailureHighlights, executeSearch, setShowHiddenEntries]
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
      contextMenuEnabled={!isMobile}
      getContextMenuState={getContextMenuState}
      onContextMenuOpenTarget={handleContextMenuOpenTarget}
      onContextMenuAction={handleContextMenuAction}
      trashFailureMessagesByEntryId={trashFailureMessagesByEntryId}
      inactiveEntryIds={inactiveEntryIds}
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
      canPasteTags={hasPasteableTags}
      onAddTagToEntries={addTagToEntries}
      onRemoveTagFromEntries={removeTagFromEntries}
      onPasteTagsToEntries={pasteTagsFromMetadata}
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
      addTagsModalRequestNonce={addTagsModalRequestNonce}
      videoPreviewStartsMuted={videoPreviewStartsMuted}
      onVideoPreviewUnmuted={handleVideoPreviewUnmuted}
      onOpenFullScreen={() => setFullScreenModalOpen(true)}
    />
  );

  const trashTargetCount = trashDialogState?.targetEntryIds.length ?? 0;

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
        ) : fullScreenModalOpen ? (
          <FullScreenMediaView
            selectedEntry={selectedEntry}
            selectedEntryIds={selectedEntryIds}
            selectedEntries={selectedEntries}
            preview={preview}
            getMediaUrl={(entryId) => api.getMediaUrl(entryId)}
            getThumbnailUrl={(entryId, options) => api.getThumbnailUrl(entryId, options)}
            resolveApiUrl={(path) => api.resolveUrl(path)}
            videoPreviewStartsMuted={videoPreviewStartsMuted}
            onVideoPreviewUnmuted={handleVideoPreviewUnmuted}
            onToggleMute={toggleVideoMute}
            onToggleFavorite={handleToggleFavorite}
            onClose={() => setFullScreenModalOpen(false)}
            onNavigatePrevious={navigatePrevious}
            onNavigateNext={navigateNext}
            hasPrevious={hasPrevious}
            hasNext={hasNext}
            allTags={allTags}
            fieldTypes={fieldTypes}
            fieldDrafts={fieldDrafts}
            newFieldKey={newFieldKey}
            newFieldValue={newFieldValue}
            tagMutationPending={tagMutationPending}
            tagEditPending={tagEditPending}
            updateFieldPending={updateFieldPending}
            canPasteTags={hasPasteableTags}
            onAddTagToEntries={addTagToEntries}
            onPasteTagsToEntries={pasteTagsFromMetadata}
            onRemoveTagFromEntries={removeTagFromEntries}
            onCreateTag={createTag}
            onUpdateTag={updateTag}
            onRefreshSelection={refreshSelectedEntry}
            onFieldDraftChange={setFieldDraft}
            onSaveField={saveField}
            onNewFieldKeyChange={setNewFieldKey}
            onNewFieldValueChange={setNewFieldValue}
            onApplyField={applyField}
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
              videoMuted={videoPreviewStartsMuted}
              onSearchInputChange={setSearchInput}
              onSearch={handleSearch}
              onSortingModeChange={handleSortingModeChange}
              onAscendingChange={handleAscendingChange}
              onUntaggedChange={handleUntaggedChange}
              onShowHiddenChange={handleShowHiddenChange}
              onOpenLibraryModal={openLibraryModal}
              onRefresh={refreshLibrary}
              onOpenSettings={openSettings}
              onToggleMute={toggleVideoMute}
              theme={theme}
              onThemeChange={setTheme}
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
          theme={theme}
          sortingMode={settingsDraft.sortingMode}
          ascending={settingsDraft.ascending}
          showHiddenEntries={settingsDraft.showHiddenEntries}
          pageSize={settingsDraft.pageSize}
          confirmBeforeTrash={settingsDraft.confirmBeforeTrash}
          savePending={savePending}
          onThemeChange={setTheme}
          onSortingModeChange={(value) => setSettingsDraft((prev) => ({ ...prev, sortingMode: value }))}
          onAscendingChange={(value) => setSettingsDraft((prev) => ({ ...prev, ascending: value }))}
          onShowHiddenChange={(value) =>
            setSettingsDraft((prev) => ({ ...prev, showHiddenEntries: value }))
          }
          onPageSizeChange={(value) => setSettingsDraft((prev) => ({ ...prev, pageSize: value }))}
          onConfirmBeforeTrashChange={(value) =>
            setSettingsDraft((prev) => ({ ...prev, confirmBeforeTrash: value }))
          }
          onSave={handleSaveSettings}
          onClose={closeSettings}
        />

        {trashDialogState ? (
          <div className="overlay" role="presentation" onClick={() => setTrashDialogState(null)}>
            <div
              className="overlay-panel panel trash-confirm-panel"
              role="dialog"
              aria-modal="true"
              aria-label="Delete confirmation"
              onClick={(event) => event.stopPropagation()}
            >
              <h2 className="panel-title mt-0">Move to Trash</h2>
              <p className="trash-confirm-copy">
                {trashTargetCount === 1
                  ? "Move 1 selected entry to Trash?"
                  : `Move ${trashTargetCount} selected entries to Trash?`}
              </p>

              <label className="settings-row settings-checkbox trash-confirm-checkbox">
                <input
                  className="toggle-base"
                  type="checkbox"
                  checked={trashDialogState.skipForSession}
                  onChange={(event) =>
                    setTrashDialogState((prev) =>
                      prev
                        ? {
                            ...prev,
                            skipForSession: event.target.checked,
                            rememberForLibrary: event.target.checked ? prev.rememberForLibrary : false
                          }
                        : prev
                    )
                  }
                />
                <span>Don&apos;t ask again this session</span>
              </label>

              {trashDialogState.skipForSession ? (
                <label className="settings-row settings-checkbox trash-confirm-checkbox">
                  <input
                    className="toggle-base"
                    type="checkbox"
                    checked={trashDialogState.rememberForLibrary}
                    onChange={(event) =>
                      setTrashDialogState((prev) =>
                        prev
                          ? {
                              ...prev,
                              rememberForLibrary: event.target.checked
                            }
                          : prev
                      )
                    }
                  />
                  <span>Also remember for this library</span>
                </label>
              ) : null}

              <div className="overlay-panel-actions">
                <Button variant="secondary" onClick={() => setTrashDialogState(null)}>
                  Cancel
                </Button>
                <Button onClick={confirmTrashDialog} disabled={isActionBusy}>
                  Move to Trash
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {undoState ? (
          <div className="undo-snackbar" role="status" aria-live="polite">
            <span className="undo-snackbar-message">{undoState.message}</span>
            <Button variant="secondary" size="sm" onClick={runUndo} disabled={undoState.pending}>
              {undoState.pending ? "Undoing..." : "Undo"}
            </Button>
          </div>
        ) : null}
      </main>
    </ModalStackProvider>
  );
}

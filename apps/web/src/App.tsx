import { type TrashFailureReasonCode } from "@tagstudio/api-client";
import { Button } from "@tagstudio/ui";
import {
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useState
} from "react";

import { api } from "@/api/client";
import { ErrorPanel } from "@/components/ErrorPanel";
import { InspectorPane } from "@/components/InspectorPane";
import { LibraryGate } from "@/components/LibraryGate";
import { LibrarySwitcherModal } from "@/components/LibrarySwitcherModal";
import { RefreshStatusPanel } from "@/components/RefreshStatusPanel";
import { SettingsModal } from "@/components/SettingsModal";
import { SplitPane } from "@/components/SplitPane";
import {
  ThumbnailGridPane,
  type ThumbnailContextMenuAction,
  type ThumbnailContextMenuState
} from "@/components/ThumbnailGridPane";
import { TopFilterBar } from "@/components/TopFilterBar";
import { useInspectorWorkflow } from "@/hooks/useInspectorWorkflow";
import { useEntryContextActions } from "@/hooks/useEntryContextActions";
import { useLibraryWorkflow } from "@/hooks/useLibraryWorkflow";
import { ModalStackProvider } from "@/hooks/useModalStackDepth";
import { useSearchWorkflow } from "@/hooks/useSearchWorkflow";
import { useSettingsWorkflow } from "@/hooks/useSettingsWorkflow";
import { useTrashActions } from "@/hooks/useTrashActions";
import { useUndoState } from "@/hooks/useUndoState";
import {
  formatAppliedFilterSummary,
  getActiveFilterCount,
  getUntaggedTokenState,
  hasUntaggedTagConflict,
  isFlatQuery,
  toggleUntaggedInQuery
} from "@/lib/entry-filters";
import { TAG_ARCHIVED_ID, TAG_FAVORITE_ID } from "@/lib/reserved-tags";
import { computeDesktopSelection } from "@/lib/tag-workflows";

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

function getFileManagerRevealLabel(): string {
  if (typeof navigator === "undefined") {
    return "Show in File Manager";
  }

  const platform = `${navigator.platform ?? ""} ${navigator.userAgent ?? ""}`.toLowerCase();
  if (platform.includes("mac")) {
    return "Show in Finder";
  }
  if (platform.includes("win")) {
    return "Show in Explorer";
  }
  return "Show in File Manager";
}

export function App() {
  const [uiError, setUiError] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [selectedEntryIds, setSelectedEntryIds] = useState<number[]>([]);
  const [selectionAnchorId, setSelectionAnchorId] = useState<number | null>(null);
  const [videoPreviewStartsMuted, setVideoPreviewStartsMuted] = useState(true);
  const [contextActionPending, setContextActionPending] = useState(false);

  const onClearError = useCallback(() => {
    setUiError(null);
  }, []);

  const onError = useCallback((message: string) => {
    setUiError(message);
  }, []);
  const handleVideoPreviewUnmuted = useCallback(() => {
    setVideoPreviewStartsMuted(false);
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

  const { undoState, clearUndo, queueUndo, runUndo } = useUndoState({
    onUndoApplied: refreshVisibleEntries,
    onError,
    onClearError
  });

  const handleDeletedEntries = useCallback((deletedIds: Set<number>) => {
    setSelectedEntryIds((prev) => prev.filter((entryId) => !deletedIds.has(entryId)));
    setSelectionAnchorId((prev) => {
      if (prev === null || !deletedIds.has(prev)) {
        return prev;
      }
      return null;
    });
  }, []);

  const {
    skipTrashConfirmSession,
    trashDialogState,
    setTrashDialogState,
    trashFailureMessagesByEntryId,
    inactiveEntryIds,
    clearTrashFailureHighlights,
    resetTrashState,
    trimInactiveByVisibleIds,
    performTrash
  } = useTrashActions({
    confirmBeforeTrash,
    setConfirmBeforeTrashPreference,
    trashEntries,
    selectedEntryId,
    clearSelection,
    formatTrashFailureReason,
    onDeletedEntries: handleDeletedEntries,
    onError,
    onClearError
  });

  useEffect(() => {
    setSelectedEntryIds([]);
    setSelectionAnchorId(null);
    setContextActionPending(false);
    clearUndo();
    resetTrashState();
  }, [activeLibraryPath, clearUndo, resetTrashState]);

  useEffect(() => {
    reconcileSelectionWithEntries(entries);

    const visibleEntryIds = new Set(entries.map((entry) => entry.id));
    setSelectedEntryIds((prev) => prev.filter((entryId) => visibleEntryIds.has(entryId)));
    trimInactiveByVisibleIds(visibleEntryIds);
  }, [entries, reconcileSelectionWithEntries, trimInactiveByVisibleIds]);

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

  const entryById = useMemo(() => {
    return new Map(entries.map((entry) => [entry.id, entry]));
  }, [entries]);

  const allTagIds = useMemo(() => {
    return new Set(allTags.map((tag) => tag.id));
  }, [allTags]);

  const revealLabel = useMemo(() => getFileManagerRevealLabel(), []);

  const isActionBusy =
    contextActionPending || tagMutationPending || trashPending || shellActionPending || refreshPending || searchPending;

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

  const runContextAsyncAction = useCallback(
    (action: () => Promise<void>) => {
      if (isActionBusy) {
        return;
      }
      setContextActionPending(true);
      void action()
        .catch((error) => {
          onError(error instanceof Error ? error.message : "Action failed.");
        })
        .finally(() => {
          setContextActionPending(false);
        });
    },
    [isActionBusy, onError]
  );

  const {
    hasPasteableTags,
    resetCopiedTagIds,
    getContextMenuState: getEntryContextMenuState,
    copyTagsFromEntries,
    pasteTagsToEntries,
    toggleReservedTagOnEntries,
    openFilesForEntries,
    revealFileInManager,
    copyFilepathsFromEntries
  } = useEntryContextActions({
    entryById,
    allTagIds,
    selectedEntryIds,
    inactiveEntryIds,
    revealLabel,
    addTagToEntries,
    removeTagFromEntries,
    applyTagMutationToEntries,
    queueUndo,
    refreshVisibleEntries,
    openEntries,
    revealEntry,
    activeLibraryPath,
    onError,
    onClearError
  });

  const getContextMenuState = useCallback(
    (entryId: number): ThumbnailContextMenuState => {
      return getEntryContextMenuState(entryId, isActionBusy);
    },
    [getEntryContextMenuState, isActionBusy]
  );

  useEffect(() => {
    resetCopiedTagIds();
  }, [activeLibraryPath, resetCopiedTagIds]);

  const handleContextMenuOpenTarget = useCallback(
    (entryId: number, targetEntryIds: number[]) => {
      if (targetEntryIds.length === 1 && targetEntryIds[0] === entryId && !selectedEntryIds.includes(entryId)) {
        setSelectedEntryIds([entryId]);
        setSelectionAnchorId(entryId);
        selectEntry(entryId);
      }
    },
    [selectEntry, selectedEntryIds]
  );

  const handleContextMenuAction = useCallback(
    (action: ThumbnailContextMenuAction, state: ThumbnailContextMenuState) => {
      if (state.targetEntryIds.length === 0) {
        return;
      }

      if (action === "open_file") {
        runContextAsyncAction(async () => {
          await openFilesForEntries(state.targetEntryIds);
        });
        return;
      }

      if (action === "reveal_file") {
        runContextAsyncAction(async () => {
          await revealFileInManager(state.contextEntryId);
        });
        return;
      }

      if (action === "copy_filepath") {
        runContextAsyncAction(async () => {
          await copyFilepathsFromEntries(state.targetEntryIds);
        });
        return;
      }

      if (action === "copy_tags") {
        copyTagsFromEntries(state.targetEntryIds);
        return;
      }

      if (action === "paste_tags") {
        runContextAsyncAction(async () => {
          await pasteTagsToEntries(state.targetEntryIds);
        });
        return;
      }

      if (action === "favorite_toggle") {
        runContextAsyncAction(async () => {
          const mode = state.favoriteMode === "favorite" ? "add" : "remove";
          await toggleReservedTagOnEntries(
            state.targetEntryIds,
            TAG_FAVORITE_ID,
            mode,
            mode === "add" ? "Favorited entries" : "Unfavorited entries"
          );
        });
        return;
      }

      if (action === "archive_toggle") {
        runContextAsyncAction(async () => {
          const mode = state.archiveMode === "archive" ? "add" : "remove";
          await toggleReservedTagOnEntries(
            state.targetEntryIds,
            TAG_ARCHIVED_ID,
            mode,
            mode === "add" ? "Archived entries" : "Unarchived entries"
          );
        });
        return;
      }

      if (action === "delete_to_trash") {
        if (!confirmBeforeTrash || skipTrashConfirmSession) {
          runContextAsyncAction(async () => {
            await performTrash(state.targetEntryIds, {
              skipForSession: false,
              rememberForLibrary: false
            });
          });
          return;
        }

        setTrashDialogState({
          targetEntryIds: state.targetEntryIds,
          skipForSession: false,
          rememberForLibrary: false
        });
      }
    },
    [
      confirmBeforeTrash,
      copyFilepathsFromEntries,
      copyTagsFromEntries,
      openFilesForEntries,
      pasteTagsToEntries,
      performTrash,
      revealFileInManager,
      runContextAsyncAction,
      skipTrashConfirmSession,
      toggleReservedTagOnEntries
    ]
  );

  const confirmTrashDialog = useCallback(() => {
    if (!trashDialogState) {
      return;
    }

    const currentDialogState = trashDialogState;
    setTrashDialogState(null);
    runContextAsyncAction(async () => {
      await performTrash(currentDialogState.targetEntryIds, {
        skipForSession: currentDialogState.skipForSession,
        rememberForLibrary: currentDialogState.rememberForLibrary
      });
    });
  }, [performTrash, runContextAsyncAction, trashDialogState]);

  const pasteTagsFromMetadata = useCallback(
    (targetEntryIds: number[]) => {
      const activeTargetIds = targetEntryIds.filter((entryId) => !inactiveEntryIds.has(entryId));
      if (activeTargetIds.length === 0) {
        return;
      }

      runContextAsyncAction(async () => {
        await pasteTagsToEntries(activeTargetIds);
      });
    },
    [inactiveEntryIds, pasteTagsToEntries, runContextAsyncAction]
  );

  const handleGridSelect = useCallback(
    (entryId: number, event: ReactMouseEvent<HTMLButtonElement>) => {
      clearTrashFailureHighlights();

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
      clearTrashFailureHighlights,
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
      videoPreviewStartsMuted={videoPreviewStartsMuted}
      onVideoPreviewUnmuted={handleVideoPreviewUnmuted}
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
              onSearch={() => {
                clearTrashFailureHighlights();
                searchFromInput();
              }}
              onSortingModeChange={(nextSortingMode) => {
                clearTrashFailureHighlights();
                setSortingMode(nextSortingMode);
                void executeSearch({
                  query: activeQuery,
                  pageIndex: 0,
                  append: false,
                  sortingMode: nextSortingMode
                });
              }}
              onAscendingChange={(nextAscending) => {
                clearTrashFailureHighlights();
                setAscending(nextAscending);
                void executeSearch({
                  query: activeQuery,
                  pageIndex: 0,
                  append: false,
                  ascending: nextAscending
                });
              }}
              onUntaggedChange={(nextUntaggedChecked) => {
                clearTrashFailureHighlights();
                const nextSearchInput = toggleUntaggedInQuery(searchInput, nextUntaggedChecked);
                setSearchInput(nextSearchInput);
                void executeSearch({
                  query: nextSearchInput,
                  pageIndex: 0,
                  append: false
                });
              }}
              onShowHiddenChange={(nextShowHiddenEntries) => {
                clearTrashFailureHighlights();
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
          confirmBeforeTrash={settingsDraft.confirmBeforeTrash}
          savePending={savePending}
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

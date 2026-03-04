import { useCallback, useEffect, useMemo, useState } from "react";

import { ErrorPanel } from "@/components/ErrorPanel";
import { InspectorPane } from "@/components/InspectorPane";
import { LibraryGate } from "@/components/LibraryGate";
import { LibrarySwitcherModal } from "@/components/LibrarySwitcherModal";
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

export function App() {
  const [uiError, setUiError] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);

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

  const {
    selectedEntry,
    preview,
    fieldDrafts,
    setFieldDraft,
    selectedTagId,
    setSelectedTagId,
    tagQuery,
    setTagQuery,
    newFieldKey,
    setNewFieldKey,
    newFieldValue,
    setNewFieldValue,
    tags,
    fieldTypes,
    tagsDisplay,
    addTagPending,
    updateFieldPending,
    refreshPending,
    refreshStatus,
    selectEntry,
    addSelectedTag,
    removeTagFromEntry,
    saveField,
    applyField,
    refreshLibrary,
    reconcileSelectionWithEntries
  } = useInspectorWorkflow({
    activeLibraryPath,
    isLibraryOpen,
    activeQuery,
    executeSearch,
    onError,
    onClearError
  });

  useEffect(() => {
    reconcileSelectionWithEntries(entries);
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

  const gridPane = (
    <ThumbnailGridPane
      entries={entries}
      totalCount={totalCount}
      selectedEntryId={selectedEntry?.id ?? null}
      activeQuery={activeQuery}
      searchPending={searchPending}
      loadingMore={loadingMore}
      hasMore={hasMore}
      onLoadMore={loadMore}
      onSelectEntry={(entryId) => {
        selectEntry(entryId);
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
      preview={preview}
      getMediaUrl={(entryId) => api.getMediaUrl(entryId)}
      tagsDisplay={tagsDisplay}
      tagQuery={tagQuery}
      selectedTagId={selectedTagId}
      fieldDrafts={fieldDrafts}
      newFieldKey={newFieldKey}
      newFieldValue={newFieldValue}
      availableTags={tags}
      fieldTypes={fieldTypes}
      addTagPending={addTagPending}
      updateFieldPending={updateFieldPending}
      onTagQueryChange={setTagQuery}
      onSelectedTagChange={setSelectedTagId}
      onAddTag={addSelectedTag}
      onRemoveTag={removeTagFromEntry}
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
  );
}

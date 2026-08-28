import { type ReactNode, useMemo, useState } from "react";
import {
  type TagBatchDeleteRequest,
  type TagBatchUpdateRequest,
  type TagCreatePayload,
  type TagMergeRequest,
  type TagResponse,
  type TagUpdatePayload
} from "@tagstudio/api-client";
import { Button } from "@tagstudio/ui";
import {
  Cloud,
  Copy,
  Eye,
  EyeOff,
  FolderPlus,
  FolderTree,
  Network,
  Pencil,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Tag as TagIcon,
  Trash2,
  X
} from "lucide-react";

import { api } from "@/api/client";
import { SplitPane, type SplitPaneState } from "@/components/SplitPane";
import { TagBatchParentModal } from "@/components/TagBatchParentModal";
import { TagBatchPropertiesModal } from "@/components/TagBatchPropertiesModal";
import { TagCloudView } from "@/components/TagCloudView";
import { TagDirectoryView } from "@/components/TagDirectoryView";
import { TagDuplicateScannerModal } from "@/components/TagDuplicateScannerModal";
import { TagEditorModal } from "@/components/TagEditorModal";
import { TagGraphView } from "@/components/TagGraphView";
import { TagMergeModal } from "@/components/TagMergeModal";
import { type UseTagExplorerWorkflowResult } from "@/hooks/useTagExplorerWorkflow";
import { useTagColors } from "@/hooks/useTagColors";
import { type DuplicateCluster } from "@/lib/tag-duplicates";
import { createTagColorLookup, resolveTagChipStyle } from "@/lib/tag-styles";
import { clientLog } from "@/observability/logger";

type TagExplorerPageProps = {
  workflow: UseTagExplorerWorkflowResult;
  gridPane: ReactNode;
  isMobile?: boolean;
  allTags?: TagResponse[];
  createTag?: (payload: TagCreatePayload) => Promise<TagResponse | null>;
  updateTag?: (tagId: number, payload: TagUpdatePayload) => Promise<TagResponse | null>;
  queueUndo?: (message: string, undo: () => Promise<void>) => void;
  refreshVisibleEntries?: () => Promise<void>;
};

export function TagExplorerPage({
  workflow,
  gridPane,
  isMobile,
  allTags = [],
  createTag,
  updateTag,
  queueUndo,
  refreshVisibleEntries
}: TagExplorerPageProps) {
  const {
    tags,
    coOccurrences,
    loading,
    interactionMode,
    selectedTagIds,
    editSelectedTagIds,
    selectedTagsList,
    editSelectedTagsList,
    selectionMode,
    viewMode,
    tagDirectorySubMode,
    tagSearchFilter,
    showHiddenTags,
    coOccurringTagIds,
    tagTree,
    filteredTags,
    editingTag,
    isMergeModalOpen,
    isBatchParentModalOpen,
    isBatchPropertiesModalOpen,
    isDuplicateScannerOpen,
    setInteractionMode,
    setTagDirectorySubMode,
    setShowHiddenTags,
    toggleTag,
    clearSelectedTags,
    toggleEditSelectTag,
    selectAllVisibleEditTags,
    clearEditSelectedTags,
    setEditingTag,
    setIsMergeModalOpen,
    setIsBatchParentModalOpen,
    setIsBatchPropertiesModalOpen,
    setIsDuplicateScannerOpen,
    setSelectionMode,
    setViewMode,
    setTagSearchFilter,
    reloadTagStats
  } = workflow;

  const tagColorsQuery = useTagColors(true);
  const colorLookup = useMemo(() => createTagColorLookup(tagColorsQuery.data), [tagColorsQuery.data]);

  // Left pane is matching entries (~58%), right pane is tag browser (~42%)
  const [splitState, setSplitState] = useState<SplitPaneState>({
    ratio: 0.58,
    primaryCollapsed: false,
    secondaryCollapsed: false,
    lastOpenRatio: 0.58
  });

  const [mobileTab, setMobileTab] = useState<"results" | "explorer">("explorer");

  // Multi-tag merge handler
  const handleExecuteMerge = async (payload: TagMergeRequest) => {
    try {
      clientLog.info("tags.merging", {
        targetTagId: payload.target_tag_id,
        sourceTagIds: payload.source_tag_ids
      });
      const res = await api.mergeTags(payload);
      await reloadTagStats();
      await refreshVisibleEntries?.();
      clearEditSelectedTags();

      if (queueUndo && res.undo_data) {
        queueUndo(`Merged ${payload.source_tag_ids.length} tags into "${res.target_tag.name}"`, async () => {
          clientLog.info("tags.undo_merge", { targetTagId: payload.target_tag_id });
          await api.undoMergeTags({ undo_data: res.undo_data });
          await reloadTagStats();
          await refreshVisibleEntries?.();
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to merge tags.";
      clientLog.error("tags.merge_error", err, { payload });
      throw err;
    }
  };

  // Batch property update handler
  const handleExecuteBatchUpdate = async (payload: TagBatchUpdateRequest) => {
    try {
      clientLog.info("tags.batch_updating", { tagIds: payload.tag_ids });
      await api.batchUpdateTags(payload);
      await reloadTagStats();
      await refreshVisibleEntries?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update tags.";
      clientLog.error("tags.batch_update_error", err, { payload });
      throw err;
    }
  };

  // Batch parent assignment handler
  const handleExecuteBatchAddParent = async (parentId: number) => {
    const payload: TagBatchUpdateRequest = {
      tag_ids: Array.from(editSelectedTagIds),
      add_parent_ids: [parentId]
    };
    try {
      clientLog.info("tags.batch_add_parent", { parentId, tagIds: payload.tag_ids });
      await api.batchUpdateTags(payload);
      await reloadTagStats();
      await refreshVisibleEntries?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to assign parent tag.";
      clientLog.error("tags.batch_add_parent_error", err, { payload });
      throw err;
    }
  };

  // Batch delete handler
  const handleExecuteBatchDelete = async () => {
    const idsToDelete = Array.from(editSelectedTagIds);
    if (idsToDelete.length === 0) return;

    const confirmed = window.confirm(
      `Are you sure you want to delete ${idsToDelete.length} selected tag(s)? Tagged entries will be untagged. This action can be undone.`
    );
    if (!confirmed) return;

    try {
      clientLog.info("tags.batch_deleting", { tagIds: idsToDelete });
      const res = await api.batchDeleteTags({ tag_ids: idsToDelete });
      await reloadTagStats();
      await refreshVisibleEntries?.();
      clearEditSelectedTags();

      if (queueUndo && res.undo_data) {
        queueUndo(`Deleted ${res.deleted_count} tag(s)`, async () => {
          clientLog.info("tags.undo_batch_delete", { count: res.deleted_count });
          await api.undoBatchDeleteTags({ undo_data: res.undo_data });
          await reloadTagStats();
          await refreshVisibleEntries?.();
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to delete tags.";
      clientLog.error("tags.batch_delete_error", err, { idsToDelete });
      window.alert(`Error deleting tags: ${msg}`);
    }
  };

  // Launch merge from duplicate scanner
  const handleSelectClusterToMerge = (cluster: DuplicateCluster) => {
    setIsDuplicateScannerOpen(false);
    // Select cluster tags for merge
    for (const t of cluster.tags) {
      if (!editSelectedTagIds.has(t.id)) {
        toggleEditSelectTag(t.id);
      }
    }
    setIsMergeModalOpen(true);
  };

  const tagBrowserPane = (
    <section className="tag-explorer-browser panel" aria-label="Tag Explorer Controls">
      {/* Header with Mode Toggle & View Mode Switcher */}
      <div className="tag-explorer-header">
        <div className="tag-explorer-title-group">
          <TagIcon size={18} className="text-blue-500" />
          <h2 className="tag-explorer-title">Tag Explorer</h2>
          <span className="tag-explorer-badge">{tags.length} tags</span>
        </div>

        {/* Interaction Mode Toggle: Browse vs Edit Mode */}
        <div className="tag-interaction-mode-toggle" role="group" aria-label="Explorer Mode">
          <button
            type="button"
            className={`tag-interaction-btn ${interactionMode === "browse" ? "tag-interaction-btn-active" : ""}`}
            onClick={() => setInteractionMode("browse")}
            title="Browse Mode: Clicking tags filters search results"
          >
            <Search size={13} />
            <span>Browse</span>
          </button>
          <button
            type="button"
            className={`tag-interaction-btn ${interactionMode === "edit" ? "tag-interaction-btn-active tag-interaction-btn-edit" : ""}`}
            onClick={() => setInteractionMode("edit")}
            title="Edit Mode: Click tags to edit, select multiple tags to merge or batch edit"
          >
            <Pencil size={13} />
            <span>Edit Mode</span>
          </button>
        </div>

        <div className="tag-explorer-actions">
          {/* Top-Level View Switcher: Cloud, Directory, Graph */}
          <div className="tag-view-mode-group" role="tablist" aria-label="View Mode">
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === "cloud"}
              className={`tag-view-mode-btn ${viewMode === "cloud" ? "tag-view-mode-btn-active" : ""}`}
              onClick={() => setViewMode("cloud")}
              title="Cloud View (Weighted by count)"
            >
              <Cloud size={14} />
              <span className="hidden sm:inline">Cloud</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === "directory"}
              className={`tag-view-mode-btn ${viewMode === "directory" ? "tag-view-mode-btn-active" : ""}`}
              onClick={() => setViewMode("directory")}
              title="Directory View (Flat list and Hierarchy)"
            >
              <FolderTree size={14} />
              <span className="hidden sm:inline">Directory</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === "graph"}
              className={`tag-view-mode-btn ${viewMode === "graph" ? "tag-view-mode-btn-active" : ""}`}
              onClick={() => setViewMode("graph")}
              title="Graph View (Co-occurrence network)"
            >
              <Network size={14} />
              <span className="hidden sm:inline">Graph</span>
            </button>
          </div>

          <button
            type="button"
            className="filter-icon-btn h-8 w-8"
            onClick={() => void reloadTagStats()}
            disabled={loading}
            title="Reload tag stats"
            aria-label="Reload tag stats"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Filter and Search Bar with Hidden Tag Toggle */}
      <div className="tag-explorer-filter-row flex items-center gap-2">
        <div className="tag-explorer-search-box flex-1">
          <Search size={14} className="tag-explorer-search-icon" />
          <input
            type="text"
            className="input-base tag-explorer-search-input"
            placeholder={interactionMode === "edit" ? "Search & select tags to edit or merge..." : "Filter tags by name, shorthand, or alias..."}
            value={tagSearchFilter}
            onChange={(e) => setTagSearchFilter(e.target.value)}
          />
          {tagSearchFilter ? (
            <button
              type="button"
              className="tag-explorer-search-clear"
              onClick={() => setTagSearchFilter("")}
              title="Clear filter"
              aria-label="Clear filter"
            >
              <X size={13} />
            </button>
          ) : null}
        </div>

        <button
          type="button"
          className={`tag-hidden-toggle-btn ${showHiddenTags ? "tag-hidden-toggle-btn-active" : ""}`}
          onClick={() => setShowHiddenTags(!showHiddenTags)}
          title={showHiddenTags ? "Showing hidden tags (Click to hide)" : "Hidden tags filtered out (Click to show)"}
          aria-pressed={showHiddenTags}
        >
          {showHiddenTags ? <Eye size={14} /> : <EyeOff size={14} />}
          <span className="text-xs hidden md:inline">{showHiddenTags ? "Hidden Shown" : "Hidden"}</span>
        </button>
      </div>

      {/* BROWSE MODE: Active Search Filter Bar */}
      {interactionMode === "browse" ? (
        selectedTagIds.size > 0 ? (
          <div className="tag-explorer-selected-bar">
            <div className="tag-explorer-selected-header">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1">
                Active Filter ({selectedTagIds.size})
              </span>
              <div className="flex items-center gap-2">
                <div className="tag-mode-toggle-group">
                  <button
                    type="button"
                    className={`tag-mode-btn ${selectionMode === "AND" ? "tag-mode-btn-active" : ""}`}
                    onClick={() => setSelectionMode("AND")}
                    title="Match entries having ALL selected tags"
                  >
                    AND
                  </button>
                  <button
                    type="button"
                    className={`tag-mode-btn ${selectionMode === "OR" ? "tag-mode-btn-active" : ""}`}
                    onClick={() => setSelectionMode("OR")}
                    title="Match entries having ANY selected tag"
                  >
                    OR
                  </button>
                </div>
                <button
                  type="button"
                  className="tag-clear-all-btn"
                  onClick={clearSelectedTags}
                  title="Clear all selected tags"
                >
                  <Trash2 size={13} />
                  Clear
                </button>
              </div>
            </div>

            <div className="tag-explorer-chips-wrap">
              {selectedTagsList.map((tag) => {
                const customStyle = resolveTagChipStyle(tag, colorLookup);
                return (
                  <div key={tag.id} className="tag-selected-chip" style={customStyle}>
                    <span>{tag.name}</span>
                    <button
                      type="button"
                      className="tag-chip-remove"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleTag(tag.id);
                      }}
                      title={`Remove ${tag.name}`}
                      aria-label={`Remove ${tag.name}`}
                    >
                      <X size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="tag-explorer-hint">
            <Sparkles size={13} className="text-blue-500 flex-shrink-0" />
            <span>Click any tag below to filter results in real time. Combine multiple tags with AND/OR.</span>
          </div>
        )
      ) : (
        /* EDIT MODE: Batch Actions Bar */
        <div className="tag-edit-mode-bar">
          <div className="tag-edit-bar-header">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
              <Pencil size={13} />
              <span>Edit Mode: {editSelectedTagIds.size} tags selected</span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                className="tag-edit-action-btn"
                onClick={selectAllVisibleEditTags}
                title="Select all matching tags"
              >
                Select All ({filteredTags.length})
              </button>
              {editSelectedTagIds.size > 0 ? (
                <button
                  type="button"
                  className="tag-edit-action-btn text-rose-500"
                  onClick={clearEditSelectedTags}
                  title="Clear edit selection"
                >
                  Clear
                </button>
              ) : null}
            </div>
          </div>

          <div className="tag-edit-actions-row">
            {/* Scan Duplicates Button */}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsDuplicateScannerOpen(true)}
              className="tag-edit-btn-tool"
              title="Scan library for duplicate and similar tags"
            >
              <Sparkles size={13} className="text-amber-500 mr-1" />
              Scan Duplicates
            </Button>

            {/* Merge Selected Tags Button (Available when 2+ tags selected) */}
            {editSelectedTagIds.size >= 2 ? (
              <Button
                variant="default"
                size="sm"
                onClick={() => setIsMergeModalOpen(true)}
                className="tag-edit-btn-merge"
                title="Combine and merge selected tags into one"
              >
                <Copy size={13} className="mr-1" />
                Merge ({editSelectedTagIds.size})
              </Button>
            ) : null}

            {/* Add Parent Tag Button (Available when 1+ tag selected) */}
            {editSelectedTagIds.size >= 1 ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setIsBatchParentModalOpen(true)}
                className="tag-edit-btn-tool"
                title="Add a common parent tag to all selected tags"
              >
                <FolderPlus size={13} className="mr-1" />
                Add Parent
              </Button>
            ) : null}

            {/* Edit Properties Button (Available when 1+ tag selected) */}
            {editSelectedTagIds.size >= 1 ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setIsBatchPropertiesModalOpen(true)}
                className="tag-edit-btn-tool"
                title="Change tag type, hidden status, or category flag"
              >
                <SlidersHorizontal size={13} className="mr-1" />
                Properties
              </Button>
            ) : null}

            {/* Batch Delete Button (Available when 1+ tag selected) */}
            {editSelectedTagIds.size >= 1 ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleExecuteBatchDelete}
                className="tag-edit-btn-delete text-rose-500 hover:bg-rose-500/10"
                title="Delete selected tags"
              >
                <Trash2 size={13} className="mr-1" />
                Delete ({editSelectedTagIds.size})
              </Button>
            ) : null}
          </div>
        </div>
      )}

      {/* Main View Area */}
      <div className="tag-explorer-view-area">
        {viewMode === "cloud" && (
          <TagCloudView
            tags={filteredTags}
            interactionMode={interactionMode}
            selectedTagIds={selectedTagIds}
            editSelectedTagIds={editSelectedTagIds}
            coOccurringTagIds={coOccurringTagIds}
            tagColors={tagColorsQuery.data}
            onToggleTag={toggleTag}
            onToggleEditSelectTag={toggleEditSelectTag}
            onOpenEditModal={(tag) => setEditingTag(tag)}
          />
        )}
        {viewMode === "directory" && (
          <TagDirectoryView
            tags={filteredTags}
            tree={tagTree}
            subMode={tagDirectorySubMode}
            onSubModeChange={setTagDirectorySubMode}
            interactionMode={interactionMode}
            selectedTagIds={selectedTagIds}
            editSelectedTagIds={editSelectedTagIds}
            coOccurringTagIds={coOccurringTagIds}
            tagColors={tagColorsQuery.data}
            onToggleSearchTag={toggleTag}
            onToggleEditSelectTag={toggleEditSelectTag}
            onOpenEditModal={(tag) => setEditingTag(tag)}
          />
        )}
        {viewMode === "graph" && (
          <TagGraphView
            tags={filteredTags}
            coOccurrences={coOccurrences}
            selectedTagIds={selectedTagIds}
            selectionMode={selectionMode}
            coOccurringTagIds={coOccurringTagIds}
            tagColors={tagColorsQuery.data}
            onToggleTag={toggleTag}
          />
        )}
      </div>

      {/* Single Tag Editor Modal */}
      {editingTag && (
        <TagEditorModal
          open={Boolean(editingTag)}
          mode="edit"
          tag={editingTag}
          onClose={() => setEditingTag(null)}
          onCreate={createTag ?? (async () => null)}
          onUpdate={updateTag ?? (async () => null)}
          onSaved={async () => {
            await reloadTagStats();
            await refreshVisibleEntries?.();
          }}
        />
      )}

      {/* Intelligent Multi-Tag Merge Modal */}
      {isMergeModalOpen && editSelectedTagsList.length >= 2 && (
        <TagMergeModal
          open={isMergeModalOpen}
          sourceTags={editSelectedTagsList}
          allTags={allTags}
          tagColors={tagColorsQuery.data}
          onClose={() => setIsMergeModalOpen(false)}
          onMerge={handleExecuteMerge}
        />
      )}

      {/* Batch Properties Modal */}
      {isBatchPropertiesModalOpen && editSelectedTagsList.length >= 1 && (
        <TagBatchPropertiesModal
          open={isBatchPropertiesModalOpen}
          selectedTags={editSelectedTagsList}
          onClose={() => setIsBatchPropertiesModalOpen(false)}
          onApply={handleExecuteBatchUpdate}
        />
      )}

      {/* Batch Parent Tag Modal */}
      {isBatchParentModalOpen && editSelectedTagsList.length >= 1 && (
        <TagBatchParentModal
          open={isBatchParentModalOpen}
          selectedTags={editSelectedTagsList}
          allTags={allTags}
          tagColors={tagColorsQuery.data}
          onClose={() => setIsBatchParentModalOpen(false)}
          onAddParent={handleExecuteBatchAddParent}
        />
      )}

      {/* Duplicate Tag Scanner Modal */}
      {isDuplicateScannerOpen && (
        <TagDuplicateScannerModal
          open={isDuplicateScannerOpen}
          tags={tags}
          allTags={allTags}
          tagColors={tagColorsQuery.data}
          onClose={() => setIsDuplicateScannerOpen(false)}
          onSelectClusterToMerge={handleSelectClusterToMerge}
        />
      )}
    </section>
  );

  if (isMobile) {
    return (
      <div className="tag-explorer-mobile-wrapper">
        <section className="mobile-pane-tabs panel">
          <button
            type="button"
            className={`mobile-pane-tab ${mobileTab === "results" ? "mobile-pane-tab-active" : ""}`}
            onClick={() => setMobileTab("results")}
          >
            Matching Files
          </button>
          <button
            type="button"
            className={`mobile-pane-tab ${mobileTab === "explorer" ? "mobile-pane-tab-active" : ""}`}
            onClick={() => setMobileTab("explorer")}
          >
            Tags ({selectedTagIds.size})
          </button>
        </section>

        <section className="content-shell">
          <div className="content-mobile-pane">
            {mobileTab === "results" ? gridPane : tagBrowserPane}
          </div>
        </section>
      </div>
    );
  }

  return (
    <section className="content-shell tag-explorer-split-shell">
      <SplitPane
        orientation="horizontal"
        state={splitState}
        onStateChange={setSplitState}
        primary={gridPane}
        secondary={tagBrowserPane}
        primaryLabel="Matching entries"
        secondaryLabel="Tag browser"
        minPrimarySize={320}
        minSecondarySize={340}
        collapseThreshold={120}
        resetRatio={0.58}
        railSize={12}
        handleSize={12}
        className="main-split tag-explorer-split"
      />
    </section>
  );
}

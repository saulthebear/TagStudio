import { type ReactNode, useMemo, useState } from "react";
import {
  Cloud,
  FolderTree,
  ListFilter,
  Network,
  RefreshCw,
  Search,
  Sparkles,
  Tag as TagIcon,
  Trash2,
  X
} from "lucide-react";

import { SplitPane, type SplitPaneState } from "@/components/SplitPane";
import { TagCloudView } from "@/components/TagCloudView";
import { TagGraphView } from "@/components/TagGraphView";
import { TagListView } from "@/components/TagListView";
import { TagTreeView } from "@/components/TagTreeView";
import {
  type UseTagExplorerWorkflowResult
} from "@/hooks/useTagExplorerWorkflow";
import { useTagColors } from "@/hooks/useTagColors";
import { createTagColorLookup, resolveTagChipStyle } from "@/lib/tag-styles";

type TagExplorerPageProps = {
  workflow: UseTagExplorerWorkflowResult;
  gridPane: ReactNode;
  isMobile?: boolean;
};

export function TagExplorerPage({ workflow, gridPane, isMobile }: TagExplorerPageProps) {
  const {
    tags,
    coOccurrences,
    loading,
    selectedTagIds,
    selectedTagsList,
    selectionMode,
    viewMode,
    tagSearchFilter,
    coOccurringTagIds,
    tagTree,
    filteredTags,
    toggleTag,
    clearSelectedTags,
    setSelectionMode,
    setViewMode,
    setTagSearchFilter,
    reloadTagStats
  } = workflow;

  const tagColorsQuery = useTagColors(true);
  const colorLookup = useMemo(() => createTagColorLookup(tagColorsQuery.data), [tagColorsQuery.data]);

  const [splitState, setSplitState] = useState<SplitPaneState>({
    ratio: 0.42,
    primaryCollapsed: false,
    secondaryCollapsed: false,
    lastOpenRatio: 0.42
  });

  const [mobileTab, setMobileTab] = useState<"explorer" | "results">("explorer");

  const tagBrowserPane = (
    <section className="tag-explorer-browser panel" aria-label="Tag Explorer Controls">
      {/* Header & View Mode Switcher */}
      <div className="tag-explorer-header">
        <div className="tag-explorer-title-group">
          <TagIcon size={18} className="text-blue-500" />
          <h2 className="tag-explorer-title">Tag Explorer</h2>
          <span className="tag-explorer-badge">{tags.length} tags</span>
        </div>

        <div className="tag-explorer-actions">
          <div className="tag-view-mode-group" role="tablist" aria-label="View Mode">
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === "cloud"}
              className={`tag-view-mode-btn ${viewMode === "cloud" ? "tag-view-mode-btn-active" : ""}`}
              onClick={() => setViewMode("cloud")}
              title="Cloud View (Size by count)"
            >
              <Cloud size={15} />
              <span className="hidden sm:inline">Cloud</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === "tree"}
              className={`tag-view-mode-btn ${viewMode === "tree" ? "tag-view-mode-btn-active" : ""}`}
              onClick={() => setViewMode("tree")}
              title="Tree View (Parent/Child hierarchy)"
            >
              <FolderTree size={15} />
              <span className="hidden sm:inline">Tree</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === "list"}
              className={`tag-view-mode-btn ${viewMode === "list" ? "tag-view-mode-btn-active" : ""}`}
              onClick={() => setViewMode("list")}
              title="List View (Sortable & virtualized)"
            >
              <ListFilter size={15} />
              <span className="hidden sm:inline">List</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === "graph"}
              className={`tag-view-mode-btn ${viewMode === "graph" ? "tag-view-mode-btn-active" : ""}`}
              onClick={() => setViewMode("graph")}
              title="Graph View (Interactive co-occurrence network)"
            >
              <Network size={15} />
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
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Tag Search Filter Input */}
      <div className="tag-explorer-search-box">
        <Search size={15} className="tag-explorer-search-icon" />
        <input
          type="text"
          className="input-base tag-explorer-search-input"
          placeholder="Filter tags by name, shorthand, or alias..."
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
            <X size={14} />
          </button>
        ) : null}
      </div>

      {/* Selected Tags & Search Query Builder Bar */}
      {selectedTagIds.size > 0 ? (
        <div className="tag-explorer-selected-bar">
          <div className="tag-explorer-selected-header">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1">
              Active Selection ({selectedTagIds.size})
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
          <Sparkles size={14} className="text-blue-500 flex-shrink-0" />
          <span>Click any tag below to filter results in real time. Combine multiple tags with AND/OR.</span>
        </div>
      )}

      {/* Main View Area */}
      <div className="tag-explorer-view-area">
        {viewMode === "cloud" && (
          <TagCloudView
            tags={filteredTags}
            selectedTagIds={selectedTagIds}
            coOccurringTagIds={coOccurringTagIds}
            tagColors={tagColorsQuery.data}
            onToggleTag={toggleTag}
          />
        )}
        {viewMode === "tree" && (
          <TagTreeView
            tree={tagTree}
            selectedTagIds={selectedTagIds}
            coOccurringTagIds={coOccurringTagIds}
            tagColors={tagColorsQuery.data}
            onToggleTag={toggleTag}
          />
        )}
        {viewMode === "list" && (
          <TagListView
            tags={filteredTags}
            selectedTagIds={selectedTagIds}
            coOccurringTagIds={coOccurringTagIds}
            tagColors={tagColorsQuery.data}
            onToggleTag={toggleTag}
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
    </section>
  );

  if (isMobile) {
    return (
      <div className="tag-explorer-mobile-wrapper">
        <section className="mobile-pane-tabs panel">
          <button
            type="button"
            className={`mobile-pane-tab ${mobileTab === "explorer" ? "mobile-pane-tab-active" : ""}`}
            onClick={() => setMobileTab("explorer")}
          >
            Tags ({selectedTagIds.size})
          </button>
          <button
            type="button"
            className={`mobile-pane-tab ${mobileTab === "results" ? "mobile-pane-tab-active" : ""}`}
            onClick={() => setMobileTab("results")}
          >
            Matching Files
          </button>
        </section>

        <section className="content-shell">
          <div className="content-mobile-pane">
            {mobileTab === "explorer" ? tagBrowserPane : gridPane}
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
        primary={tagBrowserPane}
        secondary={gridPane}
        primaryLabel="Tag browser"
        secondaryLabel="Matching entries"
        minPrimarySize={340}
        minSecondarySize={320}
        collapseThreshold={120}
        resetRatio={0.42}
        railSize={12}
        handleSize={12}
        className="main-split tag-explorer-split"
      />
    </section>
  );
}

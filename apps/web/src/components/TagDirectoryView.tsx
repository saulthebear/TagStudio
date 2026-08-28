import { useCallback, useMemo, useState } from "react";
import { Virtuoso } from "react-virtuoso";
import {
  type TagColorNamespaceResponse,
  type TagStatResponse
} from "@tagstudio/api-client";
import {
  ArrowDown01,
  ArrowDownAZ,
  ArrowUp01,
  ArrowUpAZ,
  ChevronDown,
  ChevronRight,
  EyeOff,
  Folder,
  FolderOpen,
  FolderTree,
  ListFilter,
  Pencil,
  Sparkles,
  Tag as TagIcon
} from "lucide-react";

import { type TagTreeNode } from "@/hooks/useTagExplorerWorkflow";
import { createTagColorLookup, resolveTagChipStyle } from "@/lib/tag-styles";

export type TagDirectorySubMode = "flat" | "tree";
export type TagSortOption = "count-desc" | "count-asc" | "name-asc" | "name-desc";

type TagDirectoryViewProps = {
  tags: TagStatResponse[];
  tree: TagTreeNode[];
  subMode: TagDirectorySubMode;
  onSubModeChange: (mode: TagDirectorySubMode) => void;
  interactionMode: "browse" | "edit";
  selectedTagIds: Set<number>;
  editSelectedTagIds: Set<number>;
  coOccurringTagIds: Set<number>;
  tagColors: TagColorNamespaceResponse[] | undefined;
  onToggleSearchTag: (tagId: number) => void;
  onToggleEditSelectTag: (tagId: number) => void;
  onOpenEditModal: (tag: TagStatResponse) => void;
};

type TreeNodeRowProps = {
  node: TagTreeNode;
  interactionMode: "browse" | "edit";
  selectedTagIds: Set<number>;
  editSelectedTagIds: Set<number>;
  coOccurringTagIds: Set<number>;
  expandedIds: Set<number>;
  colorLookup: ReturnType<typeof createTagColorLookup>;
  onToggleExpand: (tagId: number) => void;
  onToggleSearchTag: (tagId: number) => void;
  onToggleEditSelectTag: (tagId: number) => void;
  onOpenEditModal: (tag: TagStatResponse) => void;
};

function TreeNodeRow({
  node,
  interactionMode,
  selectedTagIds,
  editSelectedTagIds,
  coOccurringTagIds,
  expandedIds,
  colorLookup,
  onToggleExpand,
  onToggleSearchTag,
  onToggleEditSelectTag,
  onOpenEditModal
}: TreeNodeRowProps) {
  const { tag, children, depth } = node;
  const hasChildren = children.length > 0;
  const isExpanded = expandedIds.has(tag.id);
  const isSearchSelected = selectedTagIds.has(tag.id);
  const isEditSelected = editSelectedTagIds.has(tag.id);
  const isCoOccurring = coOccurringTagIds.has(tag.id);
  const customChipStyle = resolveTagChipStyle(tag, colorLookup);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (interactionMode === "edit") {
      onOpenEditModal(tag);
    } else {
      onToggleSearchTag(tag.id);
    }
  };

  return (
    <div className="tag-tree-node">
      <div
        className={`tag-tree-row ${isSearchSelected && interactionMode === "browse" ? "tag-tree-row-selected" : ""} ${isEditSelected && interactionMode === "edit" ? "tag-tree-row-edit-selected" : ""} ${isCoOccurring && !isSearchSelected ? "tag-tree-row-cooccurring" : ""}`}
        style={{ paddingLeft: `${depth * 18 + 6}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            className="tag-tree-expand-btn"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(tag.id);
            }}
            aria-label={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          </button>
        ) : (
          <span className="tag-tree-expand-spacer" />
        )}

        <div className="tag-tree-label" onClick={handleClick}>
          {interactionMode === "browse" ? (
            <input
              type="checkbox"
              className="toggle-base"
              checked={isSearchSelected}
              onChange={() => onToggleSearchTag(tag.id)}
              onClick={(e) => e.stopPropagation()}
              title="Toggle search filter"
            />
          ) : (
            <input
              type="checkbox"
              className="toggle-base tag-edit-checkbox"
              checked={isEditSelected}
              onChange={() => onToggleEditSelectTag(tag.id)}
              onClick={(e) => e.stopPropagation()}
              title="Select for batch action"
            />
          )}

          <div className="tag-tree-chip" style={customChipStyle}>
            {tag.is_category ? (
              isExpanded ? (
                <FolderOpen size={13} className="text-amber-600 dark:text-amber-400 flex-shrink-0" />
              ) : (
                <Folder size={13} className="text-amber-600 dark:text-amber-400 flex-shrink-0" />
              )
            ) : (
              <TagIcon size={12} className="opacity-70 flex-shrink-0" />
            )}
            <span className="tag-tree-name">{tag.name}</span>
            {tag.shorthand ? (
              <span className="text-[11px] opacity-75">({tag.shorthand})</span>
            ) : null}
            {tag.is_hidden ? (
              <span title="Hidden tag" className="inline-flex items-center">
                <EyeOff size={12} className="text-slate-400 flex-shrink-0" />
              </span>
            ) : null}
            {tag.tag_type !== "content" ? (
              <span className="tag-type-badge">{tag.tag_type}</span>
            ) : null}
            {isCoOccurring && !isSearchSelected && interactionMode === "browse" ? (
              <span title="Co-occurs with selected tag" className="inline-flex items-center">
                <Sparkles
                  size={12}
                  className="text-amber-500 dark:text-amber-400 animate-pulse flex-shrink-0"
                />
              </span>
            ) : null}
          </div>

          <span className="tag-tree-count-badge" title={`${tag.entry_count} entries`}>
            {tag.entry_count}
          </span>

          {interactionMode === "edit" ? (
            <button
              type="button"
              className="tag-row-edit-icon-btn"
              onClick={(e) => {
                e.stopPropagation();
                onOpenEditModal(tag);
              }}
              title={`Edit tag "${tag.name}"`}
              aria-label={`Edit tag "${tag.name}"`}
            >
              <Pencil size={12} />
            </button>
          ) : null}
        </div>
      </div>

      {hasChildren && isExpanded ? (
        <div className="tag-tree-children">
          {children.map((child) => (
            <TreeNodeRow
              key={child.tag.id}
              node={child}
              interactionMode={interactionMode}
              selectedTagIds={selectedTagIds}
              editSelectedTagIds={editSelectedTagIds}
              coOccurringTagIds={coOccurringTagIds}
              expandedIds={expandedIds}
              colorLookup={colorLookup}
              onToggleExpand={onToggleExpand}
              onToggleSearchTag={onToggleSearchTag}
              onToggleEditSelectTag={onToggleEditSelectTag}
              onOpenEditModal={onOpenEditModal}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function TagDirectoryView({
  tags,
  tree,
  subMode,
  onSubModeChange,
  interactionMode,
  selectedTagIds,
  editSelectedTagIds,
  coOccurringTagIds,
  tagColors,
  onToggleSearchTag,
  onToggleEditSelectTag,
  onOpenEditModal
}: TagDirectoryViewProps) {
  const [sortOption, setSortOption] = useState<TagSortOption>("count-desc");
  const colorLookup = useMemo(() => createTagColorLookup(tagColors), [tagColors]);

  // Tree expanded ids logic
  const allParentIds = useMemo(() => {
    const ids = new Set<number>();
    function collect(nodes: TagTreeNode[]) {
      for (const node of nodes) {
        if (node.children.length > 0) {
          ids.add(node.tag.id);
          collect(node.children);
        }
      }
    }
    collect(tree);
    return ids;
  }, [tree]);

  const [expandedIds, setExpandedIds] = useState<Set<number>>(allParentIds);

  const toggleExpand = useCallback((tagId: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(tagId)) next.delete(tagId);
      else next.add(tagId);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => setExpandedIds(allParentIds), [allParentIds]);
  const collapseAll = useCallback(() => setExpandedIds(new Set()), []);

  const sortedTags = useMemo(() => {
    const list = [...tags];
    switch (sortOption) {
      case "name-asc":
        return list.sort((a, b) => a.name.localeCompare(b.name));
      case "name-desc":
        return list.sort((a, b) => b.name.localeCompare(a.name));
      case "count-desc":
        return list.sort((a, b) => b.entry_count - a.entry_count || a.name.localeCompare(b.name));
      case "count-asc":
        return list.sort((a, b) => a.entry_count - b.entry_count || a.name.localeCompare(b.name));
      default:
        return list;
    }
  }, [tags, sortOption]);

  if (tags.length === 0) {
    return (
      <div className="tag-explorer-empty">
        <p className="text-sm text-slate-500 dark:text-slate-400">No tags match the current filter.</p>
      </div>
    );
  }

  return (
    <div className="tag-directory-container" role="region" aria-label="Tag Directory">
      {/* Directory Toolbar: Flat vs Tree Toggle + Sub-Controls */}
      <div className="tag-directory-toolbar">
        {/* Flat vs Tree Sub-Mode Switcher */}
        <div className="tag-submode-group" role="tablist" aria-label="Directory Format">
          <button
            type="button"
            role="tab"
            aria-selected={subMode === "flat"}
            className={`tag-submode-btn ${subMode === "flat" ? "tag-submode-btn-active" : ""}`}
            onClick={() => onSubModeChange("flat")}
            title="Flat list view"
          >
            <ListFilter size={13} />
            <span>Flat List</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subMode === "tree"}
            className={`tag-submode-btn ${subMode === "tree" ? "tag-submode-btn-active" : ""}`}
            onClick={() => onSubModeChange("tree")}
            title="Hierarchical tree view"
          >
            <FolderTree size={13} />
            <span>Hierarchy</span>
          </button>
        </div>

        {/* Flat Mode Sort Controls */}
        {subMode === "flat" ? (
          <div className="tag-list-sort-group">
            <button
              type="button"
              className={`tag-list-sort-btn ${sortOption === "count-desc" ? "tag-list-sort-btn-active" : ""}`}
              onClick={() => setSortOption("count-desc")}
              title="Sort by most used"
            >
              <ArrowDown01 size={13} className="inline mr-1" />
              Most Used
            </button>
            <button
              type="button"
              className={`tag-list-sort-btn ${sortOption === "count-asc" ? "tag-list-sort-btn-active" : ""}`}
              onClick={() => setSortOption("count-asc")}
              title="Sort by least used"
            >
              <ArrowUp01 size={13} className="inline mr-1" />
              Least Used
            </button>
            <button
              type="button"
              className={`tag-list-sort-btn ${sortOption === "name-asc" ? "tag-list-sort-btn-active" : ""}`}
              onClick={() => setSortOption("name-asc")}
              title="Sort alphabetical A-Z"
            >
              <ArrowDownAZ size={13} className="inline mr-1" />
              A–Z
            </button>
            <button
              type="button"
              className={`tag-list-sort-btn ${sortOption === "name-desc" ? "tag-list-sort-btn-active" : ""}`}
              onClick={() => setSortOption("name-desc")}
              title="Sort alphabetical Z-A"
            >
              <ArrowUpAZ size={13} className="inline mr-1" />
              Z–A
            </button>
          </div>
        ) : (
          /* Tree Mode Expand/Collapse Controls */
          <div className="tag-tree-actions flex items-center gap-1 text-xs">
            <button
              type="button"
              className="tag-tree-action-btn"
              onClick={expandAll}
            >
              Expand All
            </button>
            <span className="text-slate-400">•</span>
            <button
              type="button"
              className="tag-tree-action-btn"
              onClick={collapseAll}
            >
              Collapse All
            </button>
          </div>
        )}
      </div>

      {/* Main View Area */}
      <div className="tag-directory-content">
        {subMode === "flat" ? (
          <Virtuoso
            style={{ height: "100%", minHeight: 320 }}
            totalCount={sortedTags.length}
            itemContent={(index) => {
              const tag = sortedTags[index];
              const isSearchSelected = selectedTagIds.has(tag.id);
              const isEditSelected = editSelectedTagIds.has(tag.id);
              const isCoOccurring = coOccurringTagIds.has(tag.id);
              const customStyle = resolveTagChipStyle(tag, colorLookup);

              const handleRowClick = () => {
                if (interactionMode === "edit") {
                  onOpenEditModal(tag);
                } else {
                  onToggleSearchTag(tag.id);
                }
              };

              return (
                <div
                  key={tag.id}
                  className={`tag-list-item ${isSearchSelected && interactionMode === "browse" ? "tag-list-item-selected" : ""} ${isEditSelected && interactionMode === "edit" ? "tag-list-item-edit-selected" : ""} ${isCoOccurring && !isSearchSelected ? "tag-list-item-cooccurring" : ""}`}
                  onClick={handleRowClick}
                >
                  {interactionMode === "browse" ? (
                    <input
                      type="checkbox"
                      className="toggle-base"
                      checked={isSearchSelected}
                      onChange={() => onToggleSearchTag(tag.id)}
                      onClick={(e) => e.stopPropagation()}
                      title="Toggle search filter"
                    />
                  ) : (
                    <input
                      type="checkbox"
                      className="toggle-base tag-edit-checkbox"
                      checked={isEditSelected}
                      onChange={() => onToggleEditSelectTag(tag.id)}
                      onClick={(e) => e.stopPropagation()}
                      title="Select for batch action"
                    />
                  )}

                  <div className="tag-list-chip" style={customStyle}>
                    <TagIcon size={12} className="opacity-70 flex-shrink-0" />
                    <span className="tag-list-name">{tag.name}</span>
                    {tag.shorthand ? (
                      <span className="text-[11px] opacity-75">({tag.shorthand})</span>
                    ) : null}
                    {tag.is_hidden ? (
                      <span title="Hidden tag" className="inline-flex items-center">
                        <EyeOff size={12} className="text-slate-400 flex-shrink-0" />
                      </span>
                    ) : null}
                    {tag.tag_type !== "content" ? (
                      <span className="tag-type-badge">{tag.tag_type}</span>
                    ) : null}
                  </div>

                  {isCoOccurring && !isSearchSelected && interactionMode === "browse" ? (
                    <span
                      className="ml-auto mr-2 flex items-center"
                      title="Frequently co-occurs with selected tags"
                    >
                      <Sparkles
                        size={13}
                        className="text-amber-500 dark:text-amber-400 animate-pulse flex-shrink-0"
                      />
                    </span>
                  ) : null}

                  <span className="tag-list-count ml-auto" title={`${tag.entry_count} entries`}>
                    {tag.entry_count} entries
                  </span>

                  {interactionMode === "edit" ? (
                    <button
                      type="button"
                      className="tag-row-edit-icon-btn ml-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenEditModal(tag);
                      }}
                      title={`Edit tag "${tag.name}"`}
                      aria-label={`Edit tag "${tag.name}"`}
                    >
                      <Pencil size={12} />
                    </button>
                  ) : null}
                </div>
              );
            }}
          />
        ) : (
          <div className="tag-tree-list">
            {tree.map((node) => (
              <TreeNodeRow
                key={node.tag.id}
                node={node}
                interactionMode={interactionMode}
                selectedTagIds={selectedTagIds}
                editSelectedTagIds={editSelectedTagIds}
                coOccurringTagIds={coOccurringTagIds}
                expandedIds={expandedIds}
                colorLookup={colorLookup}
                onToggleExpand={toggleExpand}
                onToggleSearchTag={onToggleSearchTag}
                onToggleEditSelectTag={onToggleEditSelectTag}
                onOpenEditModal={onOpenEditModal}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

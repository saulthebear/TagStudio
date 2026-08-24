import { useCallback, useMemo, useState } from "react";
import { type TagColorNamespaceResponse } from "@tagstudio/api-client";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  Sparkles,
  Tag as TagIcon
} from "lucide-react";

import { type TagTreeNode } from "@/hooks/useTagExplorerWorkflow";
import { createTagColorLookup, resolveTagChipStyle } from "@/lib/tag-styles";

type TagTreeViewProps = {
  tree: TagTreeNode[];
  selectedTagIds: Set<number>;
  coOccurringTagIds: Set<number>;
  tagColors: TagColorNamespaceResponse[] | undefined;
  onToggleTag: (tagId: number) => void;
};

type TreeNodeItemProps = {
  node: TagTreeNode;
  selectedTagIds: Set<number>;
  coOccurringTagIds: Set<number>;
  expandedIds: Set<number>;
  colorLookup: ReturnType<typeof createTagColorLookup>;
  onToggleExpand: (tagId: number) => void;
  onToggleTag: (tagId: number) => void;
};

function TreeNodeItem({
  node,
  selectedTagIds,
  coOccurringTagIds,
  expandedIds,
  colorLookup,
  onToggleExpand,
  onToggleTag
}: TreeNodeItemProps) {
  const { tag, children, depth } = node;
  const hasChildren = children.length > 0;
  const isExpanded = expandedIds.has(tag.id);
  const isSelected = selectedTagIds.has(tag.id);
  const isCoOccurring = coOccurringTagIds.has(tag.id);
  const customChipStyle = resolveTagChipStyle(tag, colorLookup);

  return (
    <div className="tag-tree-node">
      <div
        className={`tag-tree-row ${isSelected ? "tag-tree-row-selected" : ""} ${isCoOccurring ? "tag-tree-row-cooccurring" : ""}`}
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

        <label className="tag-tree-label">
          <input
            type="checkbox"
            className="toggle-base"
            checked={isSelected}
            onChange={() => onToggleTag(tag.id)}
          />
          <div
            className="tag-tree-chip"
            style={customChipStyle}
            onClick={(e) => {
              e.preventDefault();
              onToggleTag(tag.id);
            }}
          >
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
            {isCoOccurring && !isSelected ? (
              <span className="flex items-center" title="Co-occurs with selected tag">
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
        </label>
      </div>

      {hasChildren && isExpanded ? (
        <div className="tag-tree-children">
          {children.map((child) => (
            <TreeNodeItem
              key={child.tag.id}
              node={child}
              selectedTagIds={selectedTagIds}
              coOccurringTagIds={coOccurringTagIds}
              expandedIds={expandedIds}
              colorLookup={colorLookup}
              onToggleExpand={onToggleExpand}
              onToggleTag={onToggleTag}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function TagTreeView({
  tree,
  selectedTagIds,
  coOccurringTagIds,
  tagColors,
  onToggleTag
}: TagTreeViewProps) {
  const colorLookup = useMemo(() => createTagColorLookup(tagColors), [tagColors]);

  // Expand all by default
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
      if (next.has(tagId)) {
        next.delete(tagId);
      } else {
        next.add(tagId);
      }
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setExpandedIds(allParentIds);
  }, [allParentIds]);

  const collapseAll = useCallback(() => {
    setExpandedIds(new Set());
  }, []);

  if (tree.length === 0) {
    return (
      <div className="tag-explorer-empty">
        <p className="text-sm text-slate-500 dark:text-slate-400">No tag hierarchy found matching filter.</p>
      </div>
    );
  }

  return (
    <div className="tag-tree-container" role="region" aria-label="Tag Taxonomy Tree">
      <div className="tag-tree-toolbar">
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

      <div className="tag-tree-list">
        {tree.map((node) => (
          <TreeNodeItem
            key={node.tag.id}
            node={node}
            selectedTagIds={selectedTagIds}
            coOccurringTagIds={coOccurringTagIds}
            expandedIds={expandedIds}
            colorLookup={colorLookup}
            onToggleExpand={toggleExpand}
            onToggleTag={onToggleTag}
          />
        ))}
      </div>
    </div>
  );
}

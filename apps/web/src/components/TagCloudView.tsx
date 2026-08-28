import { useMemo } from "react";
import { type TagColorNamespaceResponse, type TagStatResponse } from "@tagstudio/api-client";
import {
  ArrowDown01,
  ArrowDownAZ,
  ArrowUp01,
  ArrowUpAZ,
  Check,
  EyeOff,
  Folder,
  Pencil,
  Sparkles
} from "lucide-react";

import { createTagColorLookup, resolveTagChipStyle } from "@/lib/tag-styles";
import { getTagDisplayLabel, type TagDisplayContext } from "@/lib/tag-workflows";

export type TagCloudSortOption = "count-desc" | "count-asc" | "name-asc" | "name-desc";

type TagCloudViewProps = {
  tags: TagStatResponse[];
  sortOption?: TagCloudSortOption;
  onSortOptionChange?: (option: TagCloudSortOption) => void;
  interactionMode?: "browse" | "edit";
  selectedTagIds: Set<number>;
  editSelectedTagIds?: Set<number>;
  coOccurringTagIds: Set<number>;
  tagColors: TagColorNamespaceResponse[] | undefined;
  tagDisplayContext?: TagDisplayContext;
  onToggleTag: (tagId: number) => void;
  onToggleEditSelectTag?: (tagId: number) => void;
  onOpenEditModal?: (tag: TagStatResponse) => void;
};

export function TagCloudView({
  tags,
  sortOption = "count-desc",
  onSortOptionChange,
  interactionMode = "browse",
  selectedTagIds,
  editSelectedTagIds = new Set(),
  coOccurringTagIds,
  tagColors,
  tagDisplayContext,
  onToggleTag,
  onToggleEditSelectTag,
  onOpenEditModal
}: TagCloudViewProps) {
  const colorLookup = useMemo(() => createTagColorLookup(tagColors), [tagColors]);

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

  const { minCount, maxCount } = useMemo(() => {
    let min = Infinity;
    let max = 0;
    for (const tag of tags) {
      if (tag.entry_count < min) min = tag.entry_count;
      if (tag.entry_count > max) max = tag.entry_count;
    }
    if (min === Infinity) min = 0;
    return { minCount: min, maxCount: max };
  }, [tags]);

  // Compute font size between 0.85rem and 1.6rem
  const calculateFontSize = (count: number) => {
    if (maxCount <= minCount) return 0.95;
    const ratio = (count - minCount) / (maxCount - minCount);
    return 0.85 + ratio * 0.75;
  };

  if (tags.length === 0) {
    return (
      <div className="tag-explorer-empty">
        <p className="text-sm text-slate-500 dark:text-slate-400">No tags match the current filter.</p>
      </div>
    );
  }

  return (
    <div className="tag-cloud-wrapper" role="region" aria-label="Tag Cloud">
      {/* Cloud Toolbar with Sort Controls */}
      <div className="tag-cloud-toolbar">
        <span className="text-xs text-slate-500 dark:text-slate-400">
          Showing {sortedTags.length} tags
        </span>
        <div className="tag-list-sort-group">
          <button
            type="button"
            className={`tag-list-sort-btn ${sortOption === "count-desc" ? "tag-list-sort-btn-active" : ""}`}
            onClick={() => onSortOptionChange?.("count-desc")}
            title="Sort by most used"
          >
            <ArrowDown01 size={13} className="inline mr-1" />
            Most Used
          </button>
          <button
            type="button"
            className={`tag-list-sort-btn ${sortOption === "count-asc" ? "tag-list-sort-btn-active" : ""}`}
            onClick={() => onSortOptionChange?.("count-asc")}
            title="Sort by least used"
          >
            <ArrowUp01 size={13} className="inline mr-1" />
            Least Used
          </button>
          <button
            type="button"
            className={`tag-list-sort-btn ${sortOption === "name-asc" ? "tag-list-sort-btn-active" : ""}`}
            onClick={() => onSortOptionChange?.("name-asc")}
            title="Sort alphabetical A-Z"
          >
            <ArrowDownAZ size={13} className="inline mr-1" />
            A–Z
          </button>
          <button
            type="button"
            className={`tag-list-sort-btn ${sortOption === "name-desc" ? "tag-list-sort-btn-active" : ""}`}
            onClick={() => onSortOptionChange?.("name-desc")}
            title="Sort alphabetical Z-A"
          >
            <ArrowUpAZ size={13} className="inline mr-1" />
            Z–A
          </button>
        </div>
      </div>

      {/* Cloud Items */}
      <div className="tag-cloud-container">
        {sortedTags.map((tag) => {
          const isSearchSelected = selectedTagIds.has(tag.id);
          const isEditSelected = editSelectedTagIds.has(tag.id);
          const isCoOccurring = coOccurringTagIds.has(tag.id);
          const customStyle = resolveTagChipStyle(tag, colorLookup);
          const fontSizeRem = calculateFontSize(tag.entry_count);
          const displayLabel = getTagDisplayLabel(tag, tagDisplayContext);

          const handleClick = () => {
            if (interactionMode === "edit") {
              onOpenEditModal?.(tag);
            } else {
              onToggleTag(tag.id);
            }
          };

          return (
            <div
              key={tag.id}
              className={`tag-cloud-item ${isSearchSelected && interactionMode === "browse" ? "tag-cloud-item-selected" : ""} ${isEditSelected && interactionMode === "edit" ? "tag-cloud-item-edit-selected" : ""} ${isCoOccurring && !isSearchSelected ? "tag-cloud-item-cooccurring" : ""}`}
              style={{
                fontSize: `${fontSizeRem}rem`,
                ...customStyle
              }}
              onClick={handleClick}
              title={`${displayLabel} (${tag.entry_count} entries)${tag.aliases.length ? ` • Aliases: ${tag.aliases.join(", ")}` : ""}${isCoOccurring ? " • Frequently co-occurs with current selection" : ""}`}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleClick();
                }
              }}
            >
              {interactionMode === "edit" ? (
                <input
                  type="checkbox"
                  className="toggle-base tag-edit-checkbox mr-1"
                  checked={isEditSelected}
                  onChange={() => onToggleEditSelectTag?.(tag.id)}
                  onClick={(e) => e.stopPropagation()}
                  title="Select for batch action"
                />
              ) : isSearchSelected ? (
                <Check size={14} className="inline-block mr-1 flex-shrink-0" />
              ) : null}

              {isCoOccurring && !isSearchSelected && interactionMode === "browse" ? (
                <Sparkles
                  size={13}
                  className="inline-block mr-1 text-amber-500 dark:text-amber-400 flex-shrink-0 animate-pulse"
                />
              ) : null}

              {tag.is_category ? (
                <Folder size={12} className="inline-block mr-1 opacity-70" />
              ) : null}

              <span className="tag-cloud-name">{displayLabel}</span>
              {tag.is_hidden ? (
                <span title="Hidden tag" className="inline-flex items-center">
                  <EyeOff size={11} className="ml-1 opacity-75" />
                </span>
              ) : null}
              {tag.tag_type !== "content" ? (
                <span className="tag-type-badge ml-1">{tag.tag_type}</span>
              ) : null}

              <span className="tag-cloud-count">{tag.entry_count}</span>

              {interactionMode === "edit" ? (
                <button
                  type="button"
                  className="tag-cloud-edit-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenEditModal?.(tag);
                  }}
                  title={`Edit tag "${displayLabel}"`}
                  aria-label={`Edit tag "${displayLabel}"`}
                >
                  <Pencil size={11} />
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

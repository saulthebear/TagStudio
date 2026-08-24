import { useMemo, useState } from "react";
import { Virtuoso } from "react-virtuoso";
import { type TagColorNamespaceResponse, type TagStatResponse } from "@tagstudio/api-client";
import { ArrowDownAZ, ArrowDown01, Sparkles, Tag as TagIcon } from "lucide-react";

import { createTagColorLookup, resolveTagChipStyle } from "@/lib/tag-styles";

type TagListViewProps = {
  tags: TagStatResponse[];
  selectedTagIds: Set<number>;
  coOccurringTagIds: Set<number>;
  tagColors: TagColorNamespaceResponse[] | undefined;
  onToggleTag: (tagId: number) => void;
};

type SortOption = "name-asc" | "name-desc" | "count-desc" | "count-asc";

export function TagListView({
  tags,
  selectedTagIds,
  coOccurringTagIds,
  tagColors,
  onToggleTag
}: TagListViewProps) {
  const [sortOption, setSortOption] = useState<SortOption>("count-desc");
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

  if (tags.length === 0) {
    return (
      <div className="tag-explorer-empty">
        <p className="text-sm text-slate-500 dark:text-slate-400">No tags match the current filter.</p>
      </div>
    );
  }

  return (
    <div className="tag-list-container" role="region" aria-label="Tag List">
      <div className="tag-list-toolbar">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
          Showing {sortedTags.length} tags
        </span>
        <div className="tag-list-sort-group">
          <button
            type="button"
            className={`tag-list-sort-btn ${sortOption === "count-desc" ? "tag-list-sort-btn-active" : ""}`}
            onClick={() => setSortOption("count-desc")}
            title="Sort by most used"
          >
            <ArrowDown01 size={14} className="inline mr-1" />
            Count
          </button>
          <button
            type="button"
            className={`tag-list-sort-btn ${sortOption === "name-asc" ? "tag-list-sort-btn-active" : ""}`}
            onClick={() => setSortOption("name-asc")}
            title="Sort alphabetically"
          >
            <ArrowDownAZ size={14} className="inline mr-1" />
            Name
          </button>
        </div>
      </div>

      <div className="tag-list-scroll-area">
        <Virtuoso
          style={{ height: "100%", minHeight: 320 }}
          totalCount={sortedTags.length}
          itemContent={(index) => {
            const tag = sortedTags[index];
            const isSelected = selectedTagIds.has(tag.id);
            const isCoOccurring = coOccurringTagIds.has(tag.id);
            const customStyle = resolveTagChipStyle(tag, colorLookup);

            return (
              <div
                key={tag.id}
                className={`tag-list-item ${isSelected ? "tag-list-item-selected" : ""} ${isCoOccurring ? "tag-list-item-cooccurring" : ""}`}
                onClick={() => onToggleTag(tag.id)}
              >
                <input
                  type="checkbox"
                  className="toggle-base"
                  checked={isSelected}
                  onChange={() => onToggleTag(tag.id)}
                  onClick={(e) => e.stopPropagation()}
                />
                <div className="tag-list-chip" style={customStyle}>
                  <TagIcon size={12} className="opacity-70 flex-shrink-0" />
                  <span className="tag-list-name">{tag.name}</span>
                </div>
                {isCoOccurring && !isSelected ? (
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
                <span className="tag-list-count" title={`${tag.entry_count} entries`}>
                  {tag.entry_count} entries
                </span>
              </div>
            );
          }}
        />
      </div>
    </div>
  );
}

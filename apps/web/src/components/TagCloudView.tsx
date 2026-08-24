import { useMemo } from "react";
import { type TagColorNamespaceResponse, type TagStatResponse } from "@tagstudio/api-client";
import { Check, Sparkles } from "lucide-react";

import { createTagColorLookup, resolveTagChipStyle } from "@/lib/tag-styles";

type TagCloudViewProps = {
  tags: TagStatResponse[];
  selectedTagIds: Set<number>;
  coOccurringTagIds: Set<number>;
  tagColors: TagColorNamespaceResponse[] | undefined;
  onToggleTag: (tagId: number) => void;
};

export function TagCloudView({
  tags,
  selectedTagIds,
  coOccurringTagIds,
  tagColors,
  onToggleTag
}: TagCloudViewProps) {
  const colorLookup = useMemo(() => createTagColorLookup(tagColors), [tagColors]);

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
    <div className="tag-cloud-container" role="region" aria-label="Tag Cloud">
      {tags.map((tag) => {
        const isSelected = selectedTagIds.has(tag.id);
        const isCoOccurring = coOccurringTagIds.has(tag.id);
        const customStyle = resolveTagChipStyle(tag, colorLookup);
        const fontSizeRem = calculateFontSize(tag.entry_count);

        return (
          <button
            key={tag.id}
            type="button"
            className={`tag-cloud-item ${isSelected ? "tag-cloud-item-selected" : ""} ${isCoOccurring ? "tag-cloud-item-cooccurring" : ""}`}
            style={{
              fontSize: `${fontSizeRem}rem`,
              ...customStyle
            }}
            onClick={() => onToggleTag(tag.id)}
            title={`${tag.name} (${tag.entry_count} entries)${tag.aliases.length ? ` • Aliases: ${tag.aliases.join(", ")}` : ""}${isCoOccurring ? " • Frequently co-occurs with current selection" : ""}`}
            aria-pressed={isSelected}
          >
            {isSelected ? <Check size={14} className="inline-block mr-1 flex-shrink-0" /> : null}
            {isCoOccurring && !isSelected ? (
              <Sparkles size={13} className="inline-block mr-1 text-amber-500 dark:text-amber-400 flex-shrink-0 animate-pulse" />
            ) : null}
            <span className="tag-cloud-name">{tag.name}</span>
            <span className="tag-cloud-count">{tag.entry_count}</span>
          </button>
        );
      })}
    </div>
  );
}

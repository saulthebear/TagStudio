import { type TagResponse } from "@tagstudio/api-client";
import { type TagDisplayContext, getTagDisplayLabel } from "@/lib/tag-workflows";

export type InheritedTagRow = {
  tagId: number;
  count: number;
  state: "all" | "partial";
  tag: TagResponse | null;
};

/**
 * Collects all ancestor tag IDs for a set of direct tag IDs,
 * excluding any tags that are already directly assigned.
 */
export function collectInheritedTagIds(
  directTagIds: Iterable<number>,
  tagById: ReadonlyMap<number, TagResponse>
): Set<number> {
  const directSet = new Set(directTagIds);
  const visited = new Set<number>(directSet);
  const inherited = new Set<number>();
  const queue: number[] = [...directSet];

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (currentId === undefined) break;

    const tag = tagById.get(currentId);
    if (!tag || !Array.isArray(tag.parent_ids)) continue;

    for (const parentId of tag.parent_ids) {
      if (!visited.has(parentId)) {
        visited.add(parentId);
        inherited.add(parentId);
        queue.push(parentId);
      }
    }
  }

  return inherited;
}

export type SelectedEntryWithTags = {
  id: number;
  tag_ids: number[];
};

/**
 * Computes aggregated inherited tag rows across selected entries,
 * formatted and sorted identically to direct aggregate tag rows.
 */
export function computeAggregateInheritedTags(
  selectedEntries: readonly SelectedEntryWithTags[],
  tagById: ReadonlyMap<number, TagResponse>,
  tagDisplayContext: TagDisplayContext
): InheritedTagRow[] {
  const selectedCount = selectedEntries.length;
  if (selectedCount === 0) {
    return [];
  }

  const counts = new Map<number, number>();

  for (const entry of selectedEntries) {
    const entryInherited = collectInheritedTagIds(entry.tag_ids, tagById);
    for (const tagId of entryInherited) {
      counts.set(tagId, (counts.get(tagId) ?? 0) + 1);
    }
  }

  const rows: InheritedTagRow[] = [];
  for (const [tagId, count] of counts.entries()) {
    rows.push({
      tagId,
      count,
      state: count === selectedCount ? "all" : "partial",
      tag: tagById.get(tagId) ?? null
    });
  }

  rows.sort((a, b) => {
    const aName = a.tag ? getTagDisplayLabel(a.tag, tagDisplayContext) : String(a.tagId);
    const bName = b.tag ? getTagDisplayLabel(b.tag, tagDisplayContext) : String(b.tagId);
    return aName.localeCompare(bName);
  });

  return rows;
}

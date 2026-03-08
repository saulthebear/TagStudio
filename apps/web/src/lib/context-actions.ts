import { type EntrySummaryResponse } from "@tagstudio/api-client";

export function resolveContextTargetEntryIds(clickedId: number, selectedIds: number[]): number[] {
  if (selectedIds.includes(clickedId)) {
    return [...selectedIds];
  }
  return [clickedId];
}

export function collectTagUnionForEntries(
  entriesById: ReadonlyMap<number, EntrySummaryResponse>,
  entryIds: number[],
  excludedTagIds: ReadonlySet<number>
): number[] {
  const tags = new Set<number>();
  for (const entryId of entryIds) {
    const entry = entriesById.get(entryId);
    if (!entry) {
      continue;
    }
    for (const tagId of entry.tag_ids) {
      if (!excludedTagIds.has(tagId)) {
        tags.add(tagId);
      }
    }
  }
  return [...tags].sort((a, b) => a - b);
}

export function getTagMutationTargets(
  entriesById: ReadonlyMap<number, EntrySummaryResponse>,
  entryIds: number[],
  tagId: number,
  mode: "add" | "remove"
): number[] {
  return entryIds.filter((entryId) => {
    const entry = entriesById.get(entryId);
    if (!entry) {
      return false;
    }
    return mode === "add" ? !entry.tag_ids.includes(tagId) : entry.tag_ids.includes(tagId);
  });
}

export function getToggleModeForTag(
  entriesById: ReadonlyMap<number, EntrySummaryResponse>,
  entryIds: number[],
  tagId: number
): "add" | "remove" {
  const targetEntries = entryIds
    .map((entryId) => entriesById.get(entryId))
    .filter((entry) => entry !== undefined);
  if (targetEntries.length > 0 && targetEntries.every((entry) => entry.tag_ids.includes(tagId))) {
    return "remove";
  }
  return "add";
}

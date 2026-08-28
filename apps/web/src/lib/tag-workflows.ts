import { type TagResponse, type TagStatResponse } from "@tagstudio/api-client";

export function normalizeTagQuery(value: string): string {
  return value.trim().toLowerCase();
}

function isWordBoundaryChar(character: string | undefined): boolean {
  if (!character) {
    return true;
  }
  return !/[a-z0-9]/i.test(character);
}

function findWordBoundaryPrefix(haystack: string, needle: string): number {
  if (!needle || haystack.length < needle.length) {
    return -1;
  }

  for (let index = 1; index <= haystack.length - needle.length; index += 1) {
    if (!isWordBoundaryChar(haystack[index - 1])) {
      continue;
    }
    if (haystack.slice(index, index + needle.length) === needle) {
      return index;
    }
  }

  return -1;
}

function collectNormalizedAliases(tag: TagResponse): string[] {
  const values = [tag.shorthand ?? "", ...tag.aliases];
  return values
    .map((value) => normalizeTagQuery(value))
    .filter((value): value is string => Boolean(value));
}

type ScoreResult = {
  tier: number;
  position: number;
  lengthDelta: number;
};

function evaluateTagScore(tag: TagResponse, normalizedQuery: string): ScoreResult {
  const normalizedName = normalizeTagQuery(tag.name);
  const aliases = collectNormalizedAliases(tag);

  if (normalizedName === normalizedQuery) {
    return { tier: 0, position: 0, lengthDelta: 0 };
  }

  const exactAlias = aliases.find((alias) => alias === normalizedQuery);
  if (exactAlias) {
    return { tier: 1, position: 0, lengthDelta: Math.abs(exactAlias.length - normalizedQuery.length) };
  }

  if (normalizedName.startsWith(normalizedQuery)) {
    return { tier: 2, position: 0, lengthDelta: normalizedName.length - normalizedQuery.length };
  }

  const boundaryPrefixPosition = findWordBoundaryPrefix(normalizedName, normalizedQuery);
  if (boundaryPrefixPosition >= 0) {
    return {
      tier: 3,
      position: boundaryPrefixPosition,
      lengthDelta: normalizedName.length - normalizedQuery.length
    };
  }

  const substringPosition = normalizedName.indexOf(normalizedQuery);
  if (substringPosition >= 0) {
    return {
      tier: 4,
      position: substringPosition,
      lengthDelta: normalizedName.length - normalizedQuery.length
    };
  }

  let aliasSubstringPosition = Number.POSITIVE_INFINITY;
  let aliasLengthDelta = Number.POSITIVE_INFINITY;
  for (const alias of aliases) {
    const aliasPosition = alias.indexOf(normalizedQuery);
    if (aliasPosition < 0) {
      continue;
    }
    const aliasDelta = alias.length - normalizedQuery.length;
    if (
      aliasPosition < aliasSubstringPosition ||
      (aliasPosition === aliasSubstringPosition && aliasDelta < aliasLengthDelta)
    ) {
      aliasSubstringPosition = aliasPosition;
      aliasLengthDelta = aliasDelta;
    }
  }

  if (aliasSubstringPosition !== Number.POSITIVE_INFINITY) {
    return {
      tier: 5,
      position: aliasSubstringPosition,
      lengthDelta: aliasLengthDelta
    };
  }

  return {
    tier: 6,
    position: Number.POSITIVE_INFINITY,
    lengthDelta: Number.POSITIVE_INFINITY
  };
}

export function scoreTags(tags: TagResponse[], query: string): TagResponse[] {
  const normalizedQuery = normalizeTagQuery(query);
  const sorted = [...tags];

  sorted.sort((a, b) => {
    if (!normalizedQuery) {
      return a.name.localeCompare(b.name) || a.id - b.id;
    }

    const scoreA = evaluateTagScore(a, normalizedQuery);
    const scoreB = evaluateTagScore(b, normalizedQuery);

    if (scoreA.tier !== scoreB.tier) {
      return scoreA.tier - scoreB.tier;
    }
    if (scoreA.position !== scoreB.position) {
      return scoreA.position - scoreB.position;
    }
    if (scoreA.lengthDelta !== scoreB.lengthDelta) {
      return scoreA.lengthDelta - scoreB.lengthDelta;
    }

    return a.name.localeCompare(b.name) || a.id - b.id;
  });

  return sorted;
}

export type TagDisplayContext = {
  tagById: ReadonlyMap<number, TagResponse | TagStatResponse>;
  duplicateNames: ReadonlySet<string>;
};

const EMPTY_TAG_DISPLAY_CONTEXT: TagDisplayContext = {
  tagById: new Map<number, TagResponse | TagStatResponse>(),
  duplicateNames: new Set<string>()
};

export function createTagDisplayContext(tags: (TagResponse | TagStatResponse)[]): TagDisplayContext {
  const tagById = new Map<number, TagResponse | TagStatResponse>();
  const nameCounts = new Map<string, number>();

  for (const tag of tags) {
    tagById.set(tag.id, tag);
    const normalizedName = normalizeTagQuery(tag.name);
    if (!normalizedName) {
      continue;
    }
    nameCounts.set(normalizedName, (nameCounts.get(normalizedName) ?? 0) + 1);
  }

  const duplicateNames = new Set<string>();
  for (const [name, count] of nameCounts.entries()) {
    if (count > 1) {
      duplicateNames.add(name);
    }
  }

  return { tagById, duplicateNames };
}

function resolveParentDisplayLabel(
  parentId: number,
  tagById: ReadonlyMap<number, TagResponse | TagStatResponse>
): string {
  const parent = tagById.get(parentId);
  const label = parent?.shorthand?.trim() || parent?.name.trim();
  return label ? label : `#${parentId}`;
}

export function getTagDisplayLabel(
  tag: TagResponse | TagStatResponse,
  context: TagDisplayContext = EMPTY_TAG_DISPLAY_CONTEXT
): string {
  const normalizedName = normalizeTagQuery(tag.name);

  if (tag.disambiguation_id !== null && tag.disambiguation_id !== undefined) {
    const disambiguationLabel = resolveParentDisplayLabel(tag.disambiguation_id, context.tagById);
    return `${tag.name} (${disambiguationLabel})`;
  }

  if (normalizedName && context.duplicateNames.has(normalizedName)) {
    const parentId = tag.parent_ids.find((candidateId) => context.tagById.has(candidateId));
    if (parentId !== undefined) {
      const parentLabel = resolveParentDisplayLabel(parentId, context.tagById);
      return `${tag.name} (${parentLabel})`;
    }
    return `${tag.name} (#${tag.id})`;
  }

  return tag.name;
}

export function hasExactTagMatch(query: string, tags: TagResponse[]): boolean {
  const normalized = normalizeTagQuery(query);
  if (!normalized) {
    return true;
  }

  return tags.some((tag) => {
    if (normalizeTagQuery(tag.name) === normalized) {
      return true;
    }
    if (normalizeTagQuery(tag.shorthand ?? "") === normalized) {
      return true;
    }
    return tag.aliases.some((alias) => normalizeTagQuery(alias) === normalized);
  });
}

export function shouldShowCreateAndAdd(query: string, tags: TagResponse[]): boolean {
  const normalized = normalizeTagQuery(query);
  if (!normalized) {
    return false;
  }
  return !hasExactTagMatch(query, tags);
}

export function deriveTagApplicationState(
  selectedCount: number,
  membershipCount: number
): "none" | "partial" | "all" {
  if (membershipCount <= 0) {
    return "none";
  }
  if (selectedCount > 0 && membershipCount >= selectedCount) {
    return "all";
  }
  return "partial";
}

export function moveHighlightIndex(
  currentIndex: number,
  itemCount: number,
  direction: "up" | "down"
): number {
  if (itemCount <= 0) {
    return 0;
  }
  if (direction === "down") {
    return Math.min(itemCount - 1, currentIndex + 1);
  }
  return Math.max(0, currentIndex - 1);
}

export function isEditShortcutKey(event: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
}): boolean {
  return event.key === "Enter" && (event.ctrlKey || event.metaKey);
}

type ComputeSelectionArgs = {
  clickedId: number;
  orderedIds: number[];
  selectedIds: number[];
  activeId: number | null;
  anchorId: number | null;
  ctrlOrMeta: boolean;
  shift: boolean;
};

type SelectionResult = {
  selectedIds: number[];
  activeId: number | null;
  anchorId: number | null;
};

export function computeDesktopSelection({
  clickedId,
  orderedIds,
  selectedIds,
  activeId,
  anchorId,
  ctrlOrMeta,
  shift
}: ComputeSelectionArgs): SelectionResult {
  if (shift && anchorId !== null) {
    const anchorIndex = orderedIds.indexOf(anchorId);
    const targetIndex = orderedIds.indexOf(clickedId);
    if (anchorIndex >= 0 && targetIndex >= 0) {
      const [start, end] =
        anchorIndex <= targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex];
      return {
        selectedIds: orderedIds.slice(start, end + 1),
        activeId: clickedId,
        anchorId
      };
    }
  }

  if (ctrlOrMeta) {
    const currentlySelected = selectedIds.includes(clickedId);
    const nextSelected = currentlySelected
      ? selectedIds.filter((id) => id !== clickedId)
      : [...selectedIds, clickedId];

    if (nextSelected.length === 0) {
      return {
        selectedIds: [],
        activeId: null,
        anchorId: clickedId
      };
    }

    if (!currentlySelected) {
      return {
        selectedIds: nextSelected,
        activeId: clickedId,
        anchorId: clickedId
      };
    }

    const nextActive = activeId === clickedId ? (nextSelected.at(-1) ?? null) : activeId;
    return {
      selectedIds: nextSelected,
      activeId: nextActive,
      anchorId: clickedId
    };
  }

  return {
    selectedIds: [clickedId],
    activeId: clickedId,
    anchorId: clickedId
  };
}

export type TagWithParents = {
  id: number;
  parent_ids: number[];
};

export function buildTagAncestryMap(tags: TagWithParents[]): {
  ancestorMap: Map<number, Set<number>>;
  descendantMap: Map<number, Set<number>>;
} {
  const parentMap = new Map<number, number[]>();
  for (const tag of tags) {
    parentMap.set(tag.id, tag.parent_ids);
  }

  const ancestorMap = new Map<number, Set<number>>();
  const descendantMap = new Map<number, Set<number>>();

  for (const tag of tags) {
    ancestorMap.set(tag.id, new Set());
    if (!descendantMap.has(tag.id)) {
      descendantMap.set(tag.id, new Set());
    }
  }

  for (const tag of tags) {
    const visited = new Set<number>();
    const queue = [...tag.parent_ids];
    while (queue.length > 0) {
      const parentId = queue.shift()!;
      if (visited.has(parentId)) continue;
      visited.add(parentId);
      ancestorMap.get(tag.id)?.add(parentId);
      if (!descendantMap.has(parentId)) {
        descendantMap.set(parentId, new Set());
      }
      descendantMap.get(parentId)?.add(tag.id);

      const grandparents = parentMap.get(parentId);
      if (grandparents) {
        for (const gp of grandparents) {
          if (!visited.has(gp)) queue.push(gp);
        }
      }
    }
  }

  return { ancestorMap, descendantMap };
}

export type InheritedTagRow = {
  tagId: number;
  count: number;
  state: "all" | "partial";
  tag: TagResponse | null;
  descendantTagIds: number[];
};

export type SelectedEntryTagsSummary = {
  id: number;
  tag_ids: number[];
};

export function computeInheritedTagRows({
  selectedEntries,
  tagById,
  ancestorMap,
  tagDisplayContext = EMPTY_TAG_DISPLAY_CONTEXT,
  selectedCount
}: {
  selectedEntries: SelectedEntryTagsSummary[];
  tagById: ReadonlyMap<number, TagResponse>;
  ancestorMap: ReadonlyMap<number, Set<number>>;
  tagDisplayContext?: TagDisplayContext;
  selectedCount: number;
}): InheritedTagRow[] {
  if (selectedCount <= 0 || selectedEntries.length === 0) {
    return [];
  }

  const directTagIds = new Set<number>();
  for (const entry of selectedEntries) {
    for (const tagId of entry.tag_ids) {
      directTagIds.add(tagId);
    }
  }

  const inheritedEntryCounts = new Map<number, number>();
  for (const entry of selectedEntries) {
    const entryDirect = new Set(entry.tag_ids);
    const entryInherited = new Set<number>();
    for (const tagId of entryDirect) {
      const ancestors = ancestorMap.get(tagId);
      if (ancestors) {
        for (const ancestorId of ancestors) {
          if (!entryDirect.has(ancestorId)) {
            entryInherited.add(ancestorId);
          }
        }
      }
    }
    for (const inheritedId of entryInherited) {
      if (!directTagIds.has(inheritedId)) {
        inheritedEntryCounts.set(inheritedId, (inheritedEntryCounts.get(inheritedId) ?? 0) + 1);
      }
    }
  }

  const rows: InheritedTagRow[] = [];
  for (const [inheritedId, count] of inheritedEntryCounts.entries()) {
    const descendantTagIds: number[] = [];
    for (const directId of directTagIds) {
      if (ancestorMap.get(directId)?.has(inheritedId)) {
        descendantTagIds.push(directId);
      }
    }
    descendantTagIds.sort((a, b) => {
      const aTag = tagById.get(a);
      const bTag = tagById.get(b);
      const aName = aTag ? getTagDisplayLabel(aTag, tagDisplayContext) : String(a);
      const bName = bTag ? getTagDisplayLabel(bTag, tagDisplayContext) : String(b);
      return aName.localeCompare(bName);
    });

    rows.push({
      tagId: inheritedId,
      count,
      state: count === selectedCount ? "all" : "partial",
      tag: tagById.get(inheritedId) ?? null,
      descendantTagIds
    });
  }

  rows.sort((a, b) => {
    const aName = a.tag ? getTagDisplayLabel(a.tag, tagDisplayContext) : String(a.tagId);
    const bName = b.tag ? getTagDisplayLabel(b.tag, tagDisplayContext) : String(b.tagId);
    return aName.localeCompare(bName);
  });

  return rows;
}

export function formatSuggestedTagTooltip(label: string, confidence: number): string {
  const percentage = Math.round(confidence * 100);
  return `Add tag "${label}" (${percentage}% match)`;
}



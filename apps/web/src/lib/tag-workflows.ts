import { type TagResponse } from "@tagstudio/api-client";

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
  tagById: ReadonlyMap<number, TagResponse>;
  duplicateNames: ReadonlySet<string>;
};

const EMPTY_TAG_DISPLAY_CONTEXT: TagDisplayContext = {
  tagById: new Map<number, TagResponse>(),
  duplicateNames: new Set<string>()
};

export function createTagDisplayContext(tags: TagResponse[]): TagDisplayContext {
  const tagById = new Map<number, TagResponse>();
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

function resolveParentDisplayLabel(parentId: number, tagById: ReadonlyMap<number, TagResponse>): string {
  const parent = tagById.get(parentId);
  const label = parent?.name.trim();
  return label ? label : `#${parentId}`;
}

export function getTagDisplayLabel(
  tag: TagResponse,
  context: TagDisplayContext = EMPTY_TAG_DISPLAY_CONTEXT
): string {
  const normalizedName = normalizeTagQuery(tag.name);

  if (tag.disambiguation_id !== null) {
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

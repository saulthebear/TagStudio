import { type TagResponse } from "@tagstudio/api-client";

export function normalizeTagQuery(value: string): string {
  return value.trim().toLowerCase();
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

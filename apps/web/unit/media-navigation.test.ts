import { describe, expect, test } from "bun:test";

function calculateNextIndex(currentIndex: number, total: number, direction: "prev" | "next"): number {
  if (total === 0) return -1;
  if (direction === "prev") {
    return currentIndex <= 0 ? 0 : currentIndex - 1;
  }
  if (currentIndex < 0) return 0;
  return currentIndex >= total - 1 ? total - 1 : currentIndex + 1;
}

function clampZoom(scale: number, min = 1, max = 5): number {
  return Math.max(min, Math.min(max, scale));
}

function resolvePostDeleteTargetId(
  entries: Array<{ id: number }>,
  inactiveIds: ReadonlySet<number>,
  deletedIds: ReadonlySet<number>,
  selectedId: number | null
): number | null {
  if (selectedId === null) return null;
  const activeEntries = entries.filter(
    (e) => !inactiveIds.has(e.id) && !deletedIds.has(e.id)
  );
  if (activeEntries.length === 0) return null;

  const deletedIndex = entries.findIndex((e) => e.id === selectedId);
  let targetEntry: { id: number } | undefined;
  if (deletedIndex >= 0) {
    targetEntry = entries
      .slice(deletedIndex)
      .find((e) => !inactiveIds.has(e.id) && !deletedIds.has(e.id));
  }
  if (!targetEntry) {
    targetEntry = activeEntries[activeEntries.length - 1];
  }
  return targetEntry ? targetEntry.id : null;
}

describe("media-navigation and zoom calculations", () => {
  test("calculates previous index correctly", () => {
    expect(calculateNextIndex(2, 5, "prev")).toBe(1);
    expect(calculateNextIndex(0, 5, "prev")).toBe(0);
    expect(calculateNextIndex(-1, 5, "prev")).toBe(0);
    expect(calculateNextIndex(0, 0, "prev")).toBe(-1);
  });

  test("calculates next index correctly", () => {
    expect(calculateNextIndex(1, 5, "next")).toBe(2);
    expect(calculateNextIndex(4, 5, "next")).toBe(4);
    expect(calculateNextIndex(-1, 5, "next")).toBe(0);
    expect(calculateNextIndex(0, 0, "next")).toBe(-1);
  });

  test("clamps zoom levels within bounds", () => {
    expect(clampZoom(0.5)).toBe(1);
    expect(clampZoom(2.5)).toBe(2.5);
    expect(clampZoom(6.0)).toBe(5);
  });

  test("resolves post-delete target entry correctly", () => {
    const entries = [{ id: 10 }, { id: 20 }, { id: 30 }, { id: 40 }];
    const emptyInactive = new Set<number>();

    // Deleting middle item (20) -> advances to next item (30)
    expect(resolvePostDeleteTargetId(entries, emptyInactive, new Set([20]), 20)).toBe(30);

    // Deleting last item (40) -> falls back to previous item (30)
    expect(resolvePostDeleteTargetId(entries, emptyInactive, new Set([40]), 40)).toBe(30);

    // Deleting first item (10) -> advances to 20
    expect(resolvePostDeleteTargetId(entries, emptyInactive, new Set([10]), 10)).toBe(20);

    // Multiple contiguous deletion (20, 30) -> advances to 40
    expect(resolvePostDeleteTargetId(entries, emptyInactive, new Set([20, 30]), 20)).toBe(40);

    // Deleting only remaining item -> returns null
    expect(resolvePostDeleteTargetId([{ id: 10 }], emptyInactive, new Set([10]), 10)).toBeNull();

    // Prior inactive items are skipped
    const existingInactive = new Set([30]);
    expect(resolvePostDeleteTargetId(entries, existingInactive, new Set([20]), 20)).toBe(40);
  });
});

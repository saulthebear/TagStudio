import { describe, expect, test } from "bun:test";

import {
  computeDesktopSelection,
  deriveTagApplicationState,
  isEditShortcutKey,
  moveHighlightIndex,
  shouldShowCreateAndAdd
} from "../src/lib/tag-workflows";

describe("tag-workflows", () => {
  test("derives tri-state tag application", () => {
    expect(deriveTagApplicationState(3, 0)).toBe("none");
    expect(deriveTagApplicationState(3, 1)).toBe("partial");
    expect(deriveTagApplicationState(3, 3)).toBe("all");
  });

  test("shows create row only when no exact match exists", () => {
    const tags = [
      {
        id: 1,
        name: "Game",
        shorthand: null,
        aliases: ["gaming"],
        parent_ids: [],
        color_namespace: null,
        color_slug: null,
        disambiguation_id: null,
        is_category: false,
        is_hidden: false
      }
    ];

    expect(shouldShowCreateAndAdd("game", tags)).toBe(false);
    expect(shouldShowCreateAndAdd("gaming", tags)).toBe(false);
    expect(shouldShowCreateAndAdd("new-tag", tags)).toBe(true);
  });

  test("moves highlighted row with keyboard bounds", () => {
    expect(moveHighlightIndex(0, 0, "down")).toBe(0);
    expect(moveHighlightIndex(0, 5, "down")).toBe(1);
    expect(moveHighlightIndex(4, 5, "down")).toBe(4);
    expect(moveHighlightIndex(0, 5, "up")).toBe(0);
    expect(moveHighlightIndex(3, 5, "up")).toBe(2);
  });

  test("recognizes edit shortcut key chord", () => {
    expect(isEditShortcutKey({ key: "Enter", ctrlKey: true, metaKey: false })).toBe(true);
    expect(isEditShortcutKey({ key: "Enter", ctrlKey: false, metaKey: true })).toBe(true);
    expect(isEditShortcutKey({ key: "Enter", ctrlKey: false, metaKey: false })).toBe(false);
    expect(isEditShortcutKey({ key: "N", ctrlKey: true, metaKey: false })).toBe(false);
  });

  test("computes desktop multi-selection semantics", () => {
    const orderedIds = [11, 12, 13, 14, 15];

    const single = computeDesktopSelection({
      clickedId: 13,
      orderedIds,
      selectedIds: [],
      activeId: null,
      anchorId: null,
      ctrlOrMeta: false,
      shift: false
    });
    expect(single.selectedIds).toEqual([13]);
    expect(single.activeId).toBe(13);
    expect(single.anchorId).toBe(13);

    const toggleAdd = computeDesktopSelection({
      clickedId: 15,
      orderedIds,
      selectedIds: [13],
      activeId: 13,
      anchorId: 13,
      ctrlOrMeta: true,
      shift: false
    });
    expect(toggleAdd.selectedIds).toEqual([13, 15]);
    expect(toggleAdd.activeId).toBe(15);

    const range = computeDesktopSelection({
      clickedId: 15,
      orderedIds,
      selectedIds: [13],
      activeId: 13,
      anchorId: 13,
      ctrlOrMeta: false,
      shift: true
    });
    expect(range.selectedIds).toEqual([13, 14, 15]);
    expect(range.activeId).toBe(15);
  });
});

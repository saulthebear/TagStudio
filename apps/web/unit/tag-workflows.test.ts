import { describe, expect, test } from "bun:test";

import {
  computeDesktopSelection,
  createTagDisplayContext,
  deriveTagApplicationState,
  getTagDisplayLabel,
  isEditShortcutKey,
  moveHighlightIndex,
  scoreTags,
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

  test("scores tags by exact, prefix, boundary, substring, alias, then alphabetic fallback", () => {
    const tags = [
      {
        id: 1,
        name: "col",
        shorthand: null,
        aliases: [],
        parent_ids: [],
        color_namespace: null,
        color_slug: null,
        disambiguation_id: null,
        is_category: false,
        is_hidden: false
      },
      {
        id: 2,
        name: "Palette",
        shorthand: "col",
        aliases: [],
        parent_ids: [],
        color_namespace: null,
        color_slug: null,
        disambiguation_id: null,
        is_category: false,
        is_hidden: false
      },
      {
        id: 3,
        name: "Color",
        shorthand: null,
        aliases: [],
        parent_ids: [],
        color_namespace: null,
        color_slug: null,
        disambiguation_id: null,
        is_category: false,
        is_hidden: false
      },
      {
        id: 4,
        name: "my-color",
        shorthand: null,
        aliases: [],
        parent_ids: [],
        color_namespace: null,
        color_slug: null,
        disambiguation_id: null,
        is_category: false,
        is_hidden: false
      },
      {
        id: 5,
        name: "discoloration",
        shorthand: null,
        aliases: [],
        parent_ids: [],
        color_namespace: null,
        color_slug: null,
        disambiguation_id: null,
        is_category: false,
        is_hidden: false
      },
      {
        id: 6,
        name: "Palette B",
        shorthand: null,
        aliases: ["vivid-colors"],
        parent_ids: [],
        color_namespace: null,
        color_slug: null,
        disambiguation_id: null,
        is_category: false,
        is_hidden: false
      },
      {
        id: 7,
        name: "Zebra",
        shorthand: null,
        aliases: [],
        parent_ids: [],
        color_namespace: null,
        color_slug: null,
        disambiguation_id: null,
        is_category: false,
        is_hidden: false
      }
    ];

    const sorted = scoreTags(tags, "col");
    expect(sorted.map((tag) => tag.id)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(tags.map((tag) => tag.id)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  test("falls back to deterministic alphabetical sorting when query is empty", () => {
    const tags = [
      {
        id: 9,
        name: "beta",
        shorthand: null,
        aliases: [],
        parent_ids: [],
        color_namespace: null,
        color_slug: null,
        disambiguation_id: null,
        is_category: false,
        is_hidden: false
      },
      {
        id: 2,
        name: "alpha",
        shorthand: null,
        aliases: [],
        parent_ids: [],
        color_namespace: null,
        color_slug: null,
        disambiguation_id: null,
        is_category: false,
        is_hidden: false
      },
      {
        id: 4,
        name: "gamma",
        shorthand: null,
        aliases: [],
        parent_ids: [],
        color_namespace: null,
        color_slug: null,
        disambiguation_id: null,
        is_category: false,
        is_hidden: false
      }
    ];

    const sorted = scoreTags(tags, "");
    expect(sorted.map((tag) => tag.id)).toEqual([2, 9, 4]);
  });

  test("builds disambiguated labels from explicit and inferred parents", () => {
    const design = {
      id: 31,
      name: "Design",
      shorthand: null,
      aliases: [],
      parent_ids: [],
      color_namespace: null,
      color_slug: null,
      disambiguation_id: null,
      is_category: false,
      is_hidden: false
    };
    const paint = {
      id: 32,
      name: "Paint",
      shorthand: null,
      aliases: [],
      parent_ids: [],
      color_namespace: null,
      color_slug: null,
      disambiguation_id: null,
      is_category: false,
      is_hidden: false
    };
    const explicit = {
      id: 41,
      name: "Color",
      shorthand: null,
      aliases: [],
      parent_ids: [31],
      color_namespace: null,
      color_slug: null,
      disambiguation_id: 31,
      is_category: false,
      is_hidden: false
    };
    const inferred = {
      id: 42,
      name: "Color",
      shorthand: null,
      aliases: [],
      parent_ids: [32],
      color_namespace: null,
      color_slug: null,
      disambiguation_id: null,
      is_category: false,
      is_hidden: false
    };
    const fallback = {
      id: 43,
      name: "Color",
      shorthand: null,
      aliases: [],
      parent_ids: [],
      color_namespace: null,
      color_slug: null,
      disambiguation_id: null,
      is_category: false,
      is_hidden: false
    };

    const context = createTagDisplayContext([explicit, inferred, fallback, design, paint]);
    expect(getTagDisplayLabel(explicit, context)).toBe("Color (Design)");
    expect(getTagDisplayLabel(inferred, context)).toBe("Color (Paint)");
    expect(getTagDisplayLabel(fallback, context)).toBe("Color (#43)");
  });
});

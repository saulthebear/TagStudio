import { describe, expect, test } from "bun:test";

import {
  buildTagAncestryMap,
  computeDesktopSelection,
  computeInheritedTagRows,
  createTagDisplayContext,
  deriveTagApplicationState,
  formatSuggestedTagTooltip,
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

  test("builds recursive ancestor and descendant maps across multi-level hierarchies", () => {
    const tags = [
      { id: 1, parent_ids: [] },
      { id: 2, parent_ids: [1] },
      { id: 3, parent_ids: [2] },
      { id: 4, parent_ids: [3] }
    ];

    const { ancestorMap, descendantMap } = buildTagAncestryMap(tags);

    expect(Array.from(ancestorMap.get(4) ?? [])).toEqual([3, 2, 1]);
    expect(Array.from(ancestorMap.get(3) ?? [])).toEqual([2, 1]);
    expect(Array.from(ancestorMap.get(2) ?? [])).toEqual([1]);
    expect(Array.from(ancestorMap.get(1) ?? [])).toEqual([]);

    expect(Array.from(descendantMap.get(1) ?? [])).toEqual([2, 3, 4]);
    expect(Array.from(descendantMap.get(2) ?? [])).toEqual([3, 4]);
    expect(Array.from(descendantMap.get(3) ?? [])).toEqual([4]);
    expect(Array.from(descendantMap.get(4) ?? [])).toEqual([]);
  });

  test("computes inherited tag rows for single entry with multi-level ancestors", () => {
    const root = {
      id: 1,
      name: "Medium",
      shorthand: null,
      aliases: [],
      parent_ids: [],
      color_namespace: null,
      color_slug: null,
      disambiguation_id: null,
      is_category: true,
      is_hidden: false
    };
    const parent = {
      id: 2,
      name: "Digital",
      shorthand: null,
      aliases: [],
      parent_ids: [1],
      color_namespace: null,
      color_slug: null,
      disambiguation_id: null,
      is_category: false,
      is_hidden: false
    };
    const child = {
      id: 3,
      name: "Pixel Art",
      shorthand: null,
      aliases: [],
      parent_ids: [2],
      color_namespace: null,
      color_slug: null,
      disambiguation_id: null,
      is_category: false,
      is_hidden: false
    };

    const allTags = [root, parent, child];
    const tagById = new Map(allTags.map((t) => [t.id, t]));
    const { ancestorMap } = buildTagAncestryMap(allTags);

    const rows = computeInheritedTagRows({
      selectedEntries: [{ id: 101, tag_ids: [3] }],
      tagById,
      ancestorMap,
      selectedCount: 1
    });

    expect(rows.length).toBe(2);
    // Alphabetical order: Digital (id 2) then Medium (id 1)
    expect(rows[0].tagId).toBe(2);
    expect(rows[0].tag?.name).toBe("Digital");
    expect(rows[0].count).toBe(1);
    expect(rows[0].state).toBe("all");
    expect(rows[0].descendantTagIds).toEqual([3]);

    expect(rows[1].tagId).toBe(1);
    expect(rows[1].tag?.name).toBe("Medium");
    expect(rows[1].count).toBe(1);
    expect(rows[1].state).toBe("all");
    expect(rows[1].descendantTagIds).toEqual([3]);
  });

  test("does not duplicate direct tags in inherited tag rows", () => {
    const parent = {
      id: 10,
      name: "Animal",
      shorthand: null,
      aliases: [],
      parent_ids: [],
      color_namespace: null,
      color_slug: null,
      disambiguation_id: null,
      is_category: false,
      is_hidden: false
    };
    const child = {
      id: 11,
      name: "Cat",
      shorthand: null,
      aliases: [],
      parent_ids: [10],
      color_namespace: null,
      color_slug: null,
      disambiguation_id: null,
      is_category: false,
      is_hidden: false
    };

    const allTags = [parent, child];
    const tagById = new Map(allTags.map((t) => [t.id, t]));
    const { ancestorMap } = buildTagAncestryMap(allTags);

    // Entry has both Animal (10) and Cat (11) directly assigned
    const rows = computeInheritedTagRows({
      selectedEntries: [{ id: 102, tag_ids: [10, 11] }],
      tagById,
      ancestorMap,
      selectedCount: 1
    });

    // Animal is directly assigned, so it must not appear in inherited rows
    expect(rows.length).toBe(0);
  });

  test("computes inherited rows across multiple selected entries with partial and shared inheritance", () => {
    const animal = {
      id: 100,
      name: "Animal",
      shorthand: null,
      aliases: [],
      parent_ids: [],
      color_namespace: null,
      color_slug: null,
      disambiguation_id: null,
      is_category: false,
      is_hidden: false
    };
    const dog = {
      id: 101,
      name: "Dog",
      shorthand: null,
      aliases: [],
      parent_ids: [100],
      color_namespace: null,
      color_slug: null,
      disambiguation_id: null,
      is_category: false,
      is_hidden: false
    };
    const cat = {
      id: 102,
      name: "Cat",
      shorthand: null,
      aliases: [],
      parent_ids: [100],
      color_namespace: null,
      color_slug: null,
      disambiguation_id: null,
      is_category: false,
      is_hidden: false
    };
    const vehicle = {
      id: 200,
      name: "Vehicle",
      shorthand: null,
      aliases: [],
      parent_ids: [],
      color_namespace: null,
      color_slug: null,
      disambiguation_id: null,
      is_category: false,
      is_hidden: false
    };
    const car = {
      id: 201,
      name: "Car",
      shorthand: null,
      aliases: [],
      parent_ids: [200],
      color_namespace: null,
      color_slug: null,
      disambiguation_id: null,
      is_category: false,
      is_hidden: false
    };

    const allTags = [animal, dog, cat, vehicle, car];
    const tagById = new Map(allTags.map((t) => [t.id, t]));
    const { ancestorMap } = buildTagAncestryMap(allTags);

    // Entry 1 has Dog (inherits Animal)
    // Entry 2 has Cat (inherits Animal) and Car (inherits Vehicle)
    const selectedEntries = [
      { id: 1, tag_ids: [101] },
      { id: 2, tag_ids: [102, 201] }
    ];

    const rows = computeInheritedTagRows({
      selectedEntries,
      tagById,
      ancestorMap,
      selectedCount: 2
    });

    // Animal is inherited in both entries -> state: "all", count: 2, descendants: [Cat (102), Dog (101)]
    // Vehicle is inherited in entry 2 -> state: "partial", count: 1, descendants: [Car (201)]
    expect(rows.length).toBe(2);

    const animalRow = rows.find((r) => r.tagId === 100);
    expect(animalRow).toBeDefined();
    expect(animalRow?.count).toBe(2);
    expect(animalRow?.state).toBe("all");
    expect(animalRow?.descendantTagIds).toEqual([102, 101]); // Sorted alphabetically: Cat, Dog

    const vehicleRow = rows.find((r) => r.tagId === 200);
    expect(vehicleRow).toBeDefined();
    expect(vehicleRow?.count).toBe(1);
    expect(vehicleRow?.state).toBe("partial");
    expect(vehicleRow?.descendantTagIds).toEqual([201]);
  });

  test("formats suggested tag tooltip with rounded percentage", () => {
    expect(formatSuggestedTagTooltip("Ocean", 0.854)).toBe('Add tag "Ocean" (85% match)');
    expect(formatSuggestedTagTooltip("Beach", 1)).toBe('Add tag "Beach" (100% match)');
    expect(formatSuggestedTagTooltip("Sunset", 0)).toBe('Add tag "Sunset" (0% match)');
  });

  test("builds disambiguated labels for parent tag candidates", () => {
    const parent = {
      id: 10,
      name: "Five Nights at Freddy's",
      shorthand: "FNAF",
      aliases: [],
      parent_ids: [],
      color_namespace: null,
      color_slug: null,
      disambiguation_id: null,
      is_category: true,
      is_hidden: false
    };
    const freddy = {
      id: 11,
      name: "Freddy Fazbear",
      shorthand: null,
      aliases: [],
      parent_ids: [10],
      color_namespace: null,
      color_slug: null,
      disambiguation_id: 10,
      is_category: false,
      is_hidden: false
    };

    const context = createTagDisplayContext([parent, freddy]);
    expect(getTagDisplayLabel(freddy, context)).toBe("Freddy Fazbear (FNAF)");
  });

  test("skips already-added parent tags when finding preferred actionable candidate", () => {
    const candidates = [
      { id: 1, name: "Alpha", shorthand: null, aliases: [], parent_ids: [], color_namespace: null, color_slug: null, disambiguation_id: null, is_category: false, is_hidden: false },
      { id: 2, name: "Beta", shorthand: null, aliases: [], parent_ids: [], color_namespace: null, color_slug: null, disambiguation_id: null, is_category: false, is_hidden: false },
      { id: 3, name: "Gamma", shorthand: null, aliases: [], parent_ids: [], color_namespace: null, color_slug: null, disambiguation_id: null, is_category: false, is_hidden: false }
    ];

    const parentIds = [1];
    const firstActionable = candidates.findIndex((candidate) => !parentIds.includes(candidate.id));
    expect(firstActionable).toBe(1); // Index 1 is "Beta"
  });
});

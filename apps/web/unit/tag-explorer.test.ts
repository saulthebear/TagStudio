import { describe, expect, it } from "bun:test";
import { type TagStatResponse } from "@tagstudio/api-client";

import {
  buildSearchQueryFromTags,
  buildTagAncestryMap,
  buildTagTree
} from "@/hooks/useTagExplorerWorkflow";

describe("tag-explorer", () => {
  const sampleTags: TagStatResponse[] = [
    {
      id: 1,
      name: "Nature",
      shorthand: "nat",
      aliases: ["landscape", "outdoors"],
      parent_ids: [],
      color_namespace: "tagstudio-standard",
      color_slug: "green",
      disambiguation_id: null,
      is_category: true,
      is_hidden: false,
      entry_count: 42
    },
    {
      id: 2,
      name: "Animals",
      shorthand: null,
      aliases: ["fauna"],
      parent_ids: [1],
      color_namespace: "tagstudio-standard",
      color_slug: "blue",
      disambiguation_id: null,
      is_category: false,
      is_hidden: false,
      entry_count: 18
    },
    {
      id: 3,
      name: "Cats",
      shorthand: null,
      aliases: ["feline"],
      parent_ids: [2],
      color_namespace: null,
      color_slug: null,
      disambiguation_id: null,
      is_category: false,
      is_hidden: false,
      entry_count: 7
    },
    {
      id: 4,
      name: "Urban",
      shorthand: "urb",
      aliases: ["city"],
      parent_ids: [],
      color_namespace: null,
      color_slug: null,
      disambiguation_id: null,
      is_category: false,
      is_hidden: false,
      entry_count: 12
    }
  ];

  describe("buildSearchQueryFromTags", () => {
    it("returns empty string when no tags are selected", () => {
      expect(buildSearchQueryFromTags(new Set(), "AND")).toBe("");
      expect(buildSearchQueryFromTags(new Set(), "OR")).toBe("");
    });

    it("formats single tag query identically for AND and OR", () => {
      expect(buildSearchQueryFromTags(new Set([1]), "AND")).toBe("tag_id:1");
      expect(buildSearchQueryFromTags(new Set([1]), "OR")).toBe("tag_id:1");
    });

    it("formats multiple tags with AND mode (space-separated)", () => {
      const query = buildSearchQueryFromTags(new Set([1, 2, 3]), "AND");
      expect(query).toBe("tag_id:1 tag_id:2 tag_id:3");
    });

    it("formats multiple tags with OR mode", () => {
      const query = buildSearchQueryFromTags(new Set([1, 4]), "OR");
      expect(query).toBe("tag_id:1 OR tag_id:4");
    });
  });

  describe("buildTagTree", () => {
    it("builds hierarchical tree with correct parent-child nesting", () => {
      const tree = buildTagTree(sampleTags);
      expect(tree.length).toBe(2); // Nature and Urban are roots

      const natureNode = tree.find((n) => n.tag.id === 1);
      expect(natureNode).toBeDefined();
      expect(natureNode!.depth).toBe(0);
      expect(natureNode!.children.length).toBe(1); // Animals

      const animalsNode = natureNode!.children[0];
      expect(animalsNode.tag.id).toBe(2);
      expect(animalsNode.depth).toBe(1);
      expect(animalsNode.children.length).toBe(1); // Cats

      const catsNode = animalsNode.children[0];
      expect(catsNode.tag.id).toBe(3);
      expect(catsNode.depth).toBe(2);
      expect(catsNode.children.length).toBe(0);

      const urbanNode = tree.find((n) => n.tag.id === 4);
      expect(urbanNode).toBeDefined();
      expect(urbanNode!.children.length).toBe(0);
    });

    it("filters tree nodes preserving ancestors of matching children", () => {
      const filtered = buildTagTree(sampleTags, "cats");
      expect(filtered.length).toBe(1); // Only Nature branch contains cats

      const natureNode = filtered[0];
      expect(natureNode.tag.name).toBe("Nature");
      expect(natureNode.children[0].tag.name).toBe("Animals");
      expect(natureNode.children[0].children[0].tag.name).toBe("Cats");
    });

    it("filters tree nodes by alias", () => {
      const filtered = buildTagTree(sampleTags, "fauna");
      expect(filtered.length).toBe(1);
      expect(filtered[0].tag.name).toBe("Nature");
      expect(filtered[0].children[0].tag.name).toBe("Animals");
    });

    it("respects showHidden parameter in buildTagTree", () => {
      const tagsWithHidden: TagStatResponse[] = [
        ...sampleTags,
        {
          id: 5,
          name: "HiddenTag",
          shorthand: null,
          aliases: [],
          parent_ids: [],
          color_namespace: null,
          color_slug: null,
          disambiguation_id: null,
          is_category: false,
          is_hidden: true,
          entry_count: 3
        }
      ];

      const treeWithoutHidden = buildTagTree(tagsWithHidden, "", false);
      expect(treeWithoutHidden.some((n) => n.tag.id === 5)).toBe(false);

      const treeWithHidden = buildTagTree(tagsWithHidden, "", true);
      expect(treeWithHidden.some((n) => n.tag.id === 5)).toBe(true);
    });

    it("sorts tree root nodes and children by count and name sort options", () => {
      const treeCountDesc = buildTagTree(sampleTags, "", true, "count-desc");
      expect(treeCountDesc.map((n) => n.tag.name)).toEqual(["Nature", "Urban"]);

      const treeCountAsc = buildTagTree(sampleTags, "", true, "count-asc");
      expect(treeCountAsc.map((n) => n.tag.name)).toEqual(["Urban", "Nature"]);

      const treeNameAsc = buildTagTree(sampleTags, "", true, "name-asc");
      expect(treeNameAsc.map((n) => n.tag.name)).toEqual(["Nature", "Urban"]);

      const treeNameDesc = buildTagTree(sampleTags, "", true, "name-desc");
      expect(treeNameDesc.map((n) => n.tag.name)).toEqual(["Urban", "Nature"]);
    });
  });

  describe("buildTagAncestryMap", () => {
    it("computes recursive ancestor and descendant maps across multi-level hierarchies", () => {
      const { ancestorMap, descendantMap } = buildTagAncestryMap(sampleTags);

      // Nature (1) has no ancestors, descendants are Animals (2) and Cats (3)
      expect(ancestorMap.get(1)?.size).toBe(0);
      expect(descendantMap.get(1)?.has(2)).toBe(true);
      expect(descendantMap.get(1)?.has(3)).toBe(true);

      // Animals (2) has ancestor Nature (1), descendant Cats (3)
      expect(ancestorMap.get(2)?.has(1)).toBe(true);
      expect(descendantMap.get(2)?.has(3)).toBe(true);

      // Cats (3) has ancestors Animals (2) and Nature (1), no descendants
      expect(ancestorMap.get(3)?.has(2)).toBe(true);
      expect(ancestorMap.get(3)?.has(1)).toBe(true);
      expect(descendantMap.get(3)?.size).toBe(0);

      // Urban (4) is isolated
      expect(ancestorMap.get(4)?.size).toBe(0);
      expect(descendantMap.get(4)?.size).toBe(0);
    });
  });
});

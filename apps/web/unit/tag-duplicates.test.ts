import { describe, expect, it } from "bun:test";
import { type TagStatResponse } from "@tagstudio/api-client";
import { detectDuplicateTags } from "@/lib/tag-duplicates";

describe("detectDuplicateTags", () => {
  const makeTag = (id: number, name: string, count: number = 5): TagStatResponse => ({
    id,
    name,
    shorthand: null,
    aliases: [],
    parent_ids: [],
    color_namespace: null,
    color_slug: null,
    disambiguation_id: null,
    is_category: false,
    is_hidden: false,
    tag_type: "content",
    entry_count: count
  });

  it("detects casing and separator variations", () => {
    const tags = [
      makeTag(1, "FanArt", 10),
      makeTag(2, "fan-art", 2),
      makeTag(3, "fan_art", 4),
      makeTag(4, "landscape", 8)
    ];

    const clusters = detectDuplicateTags(tags);
    expect(clusters.length).toBe(1);
    expect(clusters[0].tags.map((t) => t.id)).toEqual([1, 3, 2]); // sorted by entry_count desc
    expect(clusters[0].suggestedTargetId).toBe(1);
  });

  it("detects plural and singular variations", () => {
    const tags = [
      makeTag(10, "cat", 20),
      makeTag(11, "cats", 5),
      makeTag(12, "city", 15),
      makeTag(13, "cities", 3),
      makeTag(14, "dog", 10)
    ];

    const clusters = detectDuplicateTags(tags);
    expect(clusters.length).toBe(2);

    const catCluster = clusters.find((c) => c.tags.some((t) => t.name === "cat"));
    expect(catCluster).toBeDefined();
    expect(catCluster?.suggestedTargetId).toBe(10);
    expect(catCluster?.reason).toContain("Plural");

    const cityCluster = clusters.find((c) => c.tags.some((t) => t.name === "city"));
    expect(cityCluster).toBeDefined();
    expect(cityCluster?.suggestedTargetId).toBe(12);
  });

  it("detects 1-character typos on longer tag names", () => {
    const tags = [
      makeTag(20, "illustration", 50),
      makeTag(21, "illustratin", 1),
      makeTag(22, "nature", 12)
    ];

    const clusters = detectDuplicateTags(tags);
    expect(clusters.length).toBe(1);
    expect(clusters[0].tags.map((t) => t.name)).toEqual(["illustration", "illustratin"]);
  });

  it("does not suggest merging tags with different disambiguators even if names match", () => {
    const tags = [
      {
        ...makeTag(100, "Apple", 25),
        disambiguation_id: 10 // Fruit parent
      },
      {
        ...makeTag(101, "Apple", 50),
        disambiguation_id: 20 // Company parent
      },
      {
        ...makeTag(102, "Apple", 5),
        disambiguation_id: null // Generic
      }
    ];

    const clusters = detectDuplicateTags(tags);
    expect(clusters.length).toBe(0);
  });

  it("returns empty array when no duplicates exist", () => {
    const tags = [
      makeTag(1, "apple", 10),
      makeTag(2, "banana", 15),
      makeTag(3, "cherry", 5)
    ];

    const clusters = detectDuplicateTags(tags);
    expect(clusters.length).toBe(0);
  });
});

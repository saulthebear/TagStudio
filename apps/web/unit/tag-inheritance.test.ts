import { describe, expect, it } from "bun:test";
import { type TagResponse } from "@tagstudio/api-client";
import { collectInheritedTagIds, computeAggregateInheritedTags } from "@/lib/tag-inheritance";
import { createTagDisplayContext } from "@/lib/tag-workflows";

function createTag(partial: Partial<TagResponse> & { id: number; name: string }): TagResponse {
  return {
    id: partial.id,
    name: partial.name,
    shorthand: partial.shorthand ?? null,
    aliases: partial.aliases ?? [],
    parent_ids: partial.parent_ids ?? [],
    color_namespace: partial.color_namespace ?? null,
    color_slug: partial.color_slug ?? null,
    disambiguation_id: partial.disambiguation_id ?? null,
    is_category: partial.is_category ?? false,
    is_hidden: partial.is_hidden ?? false
  };
}

describe("tag-inheritance", () => {
  const tagAnimal = createTag({ id: 1, name: "Animal", parent_ids: [] });
  const tagDog = createTag({ id: 2, name: "Dog", parent_ids: [1] });
  const tagCorgi = createTag({ id: 3, name: "Corgi", parent_ids: [2] });
  const tagPet = createTag({ id: 4, name: "Pet", parent_ids: [] });
  const tagCat = createTag({ id: 5, name: "Cat", parent_ids: [1, 4] });

  const tagById = new Map<number, TagResponse>([
    [1, tagAnimal],
    [2, tagDog],
    [3, tagCorgi],
    [4, tagPet],
    [5, tagCat]
  ]);

  it("derives direct parent and grandparent tags for an entry", () => {
    // Corgi -> Dog -> Animal
    const inherited = collectInheritedTagIds([3], tagById);
    expect(inherited).toEqual(new Set([2, 1]));
  });

  it("handles multiple parent tags (diamond / multiple inheritance)", () => {
    // Cat -> Animal, Pet
    const inherited = collectInheritedTagIds([5], tagById);
    expect(inherited).toEqual(new Set([1, 4]));
  });

  it("excludes tags that are already directly assigned to the entry", () => {
    // Entry has Corgi AND Dog directly assigned -> Dog is direct, only Animal is inherited
    const inherited = collectInheritedTagIds([3, 2], tagById);
    expect(inherited).toEqual(new Set([1]));
  });

  it("prevents infinite loops on cyclical parent relationships", () => {
    const cycleA = createTag({ id: 10, name: "A", parent_ids: [11] });
    const cycleB = createTag({ id: 11, name: "B", parent_ids: [10] });
    const cyclicTagById = new Map<number, TagResponse>([
      [10, cycleA],
      [11, cycleB]
    ]);

    const inherited = collectInheritedTagIds([10], cyclicTagById);
    expect(inherited).toEqual(new Set([11]));
  });

  it("computes aggregate inherited tags across multi-selection with partial state", () => {
    const entries = [
      { id: 101, tag_ids: [3] }, // Corgi -> inherits Dog (2), Animal (1)
      { id: 102, tag_ids: [5] }  // Cat -> inherits Pet (4), Animal (1)
    ];

    const context = createTagDisplayContext([...tagById.values()]);
    const aggregate = computeAggregateInheritedTags(entries, tagById, context);

    expect(aggregate).toEqual([
      { tagId: 1, count: 2, state: "all", tag: tagAnimal },
      { tagId: 2, count: 1, state: "partial", tag: tagDog },
      { tagId: 4, count: 1, state: "partial", tag: tagPet }
    ]);
  });
});

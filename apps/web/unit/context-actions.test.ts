import { describe, expect, test } from "bun:test";

import {
  collectTagUnionForEntries,
  getTagMutationTargets,
  getToggleModeForTag,
  resolveContextTargetEntryIds
} from "../src/lib/context-actions";

const entriesById = new Map([
  [
    10,
    {
      id: 10,
      path: "a/foo.png",
      filename: "foo.png",
      suffix: "png",
      tag_ids: [1, 3, 7]
    }
  ],
  [
    11,
    {
      id: 11,
      path: "b/bar.png",
      filename: "bar.png",
      suffix: "png",
      tag_ids: [0, 7, 8]
    }
  ],
  [
    12,
    {
      id: 12,
      path: "c/baz.png",
      filename: "baz.png",
      suffix: "png",
      tag_ids: []
    }
  ]
]);

describe("context-actions", () => {
  test("targets current selection when clicked entry is already selected", () => {
    expect(resolveContextTargetEntryIds(11, [10, 11, 12])).toEqual([10, 11, 12]);
  });

  test("targets only clicked entry when clicked entry is unselected", () => {
    expect(resolveContextTargetEntryIds(99, [10, 11, 12])).toEqual([99]);
  });

  test("collects union of tags and excludes reserved tags", () => {
    const excluded = new Set([0, 1]);
    expect(collectTagUnionForEntries(entriesById, [10, 11, 12], excluded)).toEqual([3, 7, 8]);
  });

  test("computes add/remove mutation targets", () => {
    expect(getTagMutationTargets(entriesById, [10, 11, 12], 7, "add")).toEqual([12]);
    expect(getTagMutationTargets(entriesById, [10, 11, 12], 7, "remove")).toEqual([10, 11]);
  });

  test("derives toggle mode from complete membership", () => {
    expect(getToggleModeForTag(entriesById, [10, 11], 7)).toBe("remove");
    expect(getToggleModeForTag(entriesById, [10, 12], 7)).toBe("add");
  });
});

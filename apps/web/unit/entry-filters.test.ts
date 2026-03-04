import { describe, expect, test } from "bun:test";

import {
  formatAppliedFilterSummary,
  getActiveFilterCount,
  getUntaggedTokenState,
  hasUntaggedTagConflict,
  isFlatQuery,
  toggleUntaggedInQuery
} from "../src/lib/entry-filters";

describe("entry-filters", () => {
  test("detects flat query shape", () => {
    expect(isFlatQuery("tag:foo special:untagged")).toBe(true);
    expect(isFlatQuery("(special:untagged OR tag:foo)")).toBe(false);
    expect(isFlatQuery("tag:foo or path:*")).toBe(false);
    expect(isFlatQuery("color:orange")).toBe(true);
  });

  test("handles untagged token state detection", () => {
    expect(getUntaggedTokenState("special:untagged")).toEqual({
      positive: true,
      negated: false
    });
    expect(getUntaggedTokenState("NOT special:untagged")).toEqual({
      positive: false,
      negated: true
    });
  });

  test("toggles untagged in flat queries surgically", () => {
    expect(toggleUntaggedInQuery("tag:foo special:untagged", false)).toBe("tag:foo");
    expect(toggleUntaggedInQuery("tag:foo NOT special:untagged", true)).toBe(
      "tag:foo special:untagged"
    );
  });

  test("uses conservative removal for complex queries", () => {
    const complex = "(special:untagged OR tag:foo)";
    expect(toggleUntaggedInQuery(complex, false)).toBe(complex);
    expect(toggleUntaggedInQuery("tag:foo OR path:*", true)).toBe(
      "tag:foo OR path:* special:untagged"
    );
  });

  test("tracks conflict and active filter counts", () => {
    expect(hasUntaggedTagConflict("tag:foo special:untagged")).toBe(true);
    expect(hasUntaggedTagConflict("tag:foo NOT special:untagged")).toBe(false);
    expect(getActiveFilterCount("special:untagged", true)).toBe(2);
  });

  test("formats applied summary", () => {
    expect(formatAppliedFilterSummary("", false)).toBe("none");
    expect(formatAppliedFilterSummary("special:untagged", false)).toBe("special:untagged");
    expect(formatAppliedFilterSummary("special:untagged", true)).toBe(
      "special:untagged | Show hidden entries"
    );
  });
});

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
});

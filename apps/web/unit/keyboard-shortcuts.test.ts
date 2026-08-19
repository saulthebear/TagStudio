import { describe, expect, test } from "bun:test";

import { findMatchingShortcut, matchesCombo, SHORTCUT_REGISTRY } from "../src/lib/shortcuts";

describe("SHORTCUT_REGISTRY & matching engine", () => {
  test("contains all expected shortcut definitions", () => {
    const ids = SHORTCUT_REGISTRY.map((s) => s.id);
    expect(ids).toContain("toggle-fullscreen");
    expect(ids).toContain("toggle-favorite");
    expect(ids).toContain("toggle-mute");
    expect(ids).toContain("toggle-add-tags");
    expect(ids).toContain("toggle-metadata");
    expect(ids).toContain("delete-entries");
    expect(ids).toContain("select-all");
    expect(ids).toContain("copy-tags");
    expect(ids).toContain("paste-tags");
    expect(ids).toContain("show-help");
  });

  test("matches single key combo correctly", () => {
    const event = { key: "f" };
    expect(matchesCombo(event, { key: "f" })).toBeTrue();
  });

  test("matches modifier key combo correctly", () => {
    const event = { key: "c", metaKey: true };
    expect(matchesCombo(event, { key: "c", mod: true })).toBeTrue();
  });

  test("matches multiple combos for single command (favorite)", () => {
    const shiftFEvent = { key: "F", shiftKey: true };
    const sEvent = { key: "s" };

    const favDef = SHORTCUT_REGISTRY.find((s) => s.id === "toggle-favorite");
    expect(favDef).toBeDefined();

    const matchesShiftF = favDef?.combos.some((combo) => matchesCombo(shiftFEvent, combo));
    const matchesS = favDef?.combos.some((combo) => matchesCombo(sEvent, combo));

    expect(matchesShiftF).toBeTrue();
    expect(matchesS).toBeTrue();
  });

  test("finds matching shortcut from KeyboardEvent", () => {
    const helpEvent = { key: "?", shiftKey: true };
    const foundHelp = findMatchingShortcut(helpEvent);
    expect(foundHelp?.id).toBe("show-help");

    const deleteEvent = { key: "Delete" };
    const foundDelete = findMatchingShortcut(deleteEvent);
    expect(foundDelete?.id).toBe("delete-entries");
  });

  test("filters shortcuts by scope", () => {
    const metadataEvent = { key: "i" };
    const gridSearch = findMatchingShortcut(metadataEvent, "grid");
    expect(gridSearch).toBeNull();

    const fullscreenSearch = findMatchingShortcut(metadataEvent, "fullscreen");
    expect(fullscreenSearch?.id).toBe("toggle-metadata");

    const deleteEvent = { key: "Delete" };
    expect(findMatchingShortcut(deleteEvent, "grid")?.id).toBe("delete-entries");
    expect(findMatchingShortcut(deleteEvent, "fullscreen")?.id).toBe("delete-entries");
  });
});

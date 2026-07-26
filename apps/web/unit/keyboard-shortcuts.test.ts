import { describe, expect, test } from "bun:test";

export type ShortcutAction =
  | "fullscreen"
  | "favorite"
  | "mute"
  | "add_tags"
  | "metadata"
  | "delete"
  | "select_all"
  | "copy_tags"
  | "paste_tags"
  | "navigate_prev"
  | "navigate_next"
  | null;

export function resolveKeyboardShortcut(event: {
  key: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  isInputActive?: boolean;
}): ShortcutAction {
  if (event.isInputActive) {
    return null;
  }

  const isCtrlOrMeta = Boolean(event.ctrlKey || event.metaKey);

  if (isCtrlOrMeta) {
    const key = event.key.toLowerCase();
    if (key === "a") return "select_all";
    if (key === "c") return "copy_tags";
    if (key === "v") return "paste_tags";
    return null;
  }

  if (event.key === "ArrowLeft") return "navigate_prev";
  if (event.key === "ArrowRight") return "navigate_next";

  if (event.key === "f") return "fullscreen";
  if ((event.key === "F" && event.shiftKey) || event.key === "s" || event.key === "S") return "favorite";
  if (event.key === "m" || event.key === "M") return "mute";
  if (event.key === "t" || event.key === "T") return "add_tags";
  if (event.key === "i" || event.key === "I") return "metadata";
  if (event.key === "Delete" || event.key === "Backspace") return "delete";

  return null;
}

describe("keyboard-shortcuts resolution", () => {
  test("resolves f for full screen mode when not in text input", () => {
    expect(resolveKeyboardShortcut({ key: "f" })).toBe("fullscreen");
    expect(resolveKeyboardShortcut({ key: "f", isInputActive: true })).toBeNull();
  });

  test("resolves m for mute toggle", () => {
    expect(resolveKeyboardShortcut({ key: "m" })).toBe("mute");
    expect(resolveKeyboardShortcut({ key: "M" })).toBe("mute");
  });

  test("resolves t for add tags modal toggle", () => {
    expect(resolveKeyboardShortcut({ key: "t" })).toBe("add_tags");
    expect(resolveKeyboardShortcut({ key: "T" })).toBe("add_tags");
  });

  test("resolves i for metadata panel toggle", () => {
    expect(resolveKeyboardShortcut({ key: "i" })).toBe("metadata");
    expect(resolveKeyboardShortcut({ key: "I" })).toBe("metadata");
  });

  test("resolves Shift+F and s for favorite tag toggle", () => {
    expect(resolveKeyboardShortcut({ key: "F", shiftKey: true })).toBe("favorite");
    expect(resolveKeyboardShortcut({ key: "s" })).toBe("favorite");
    expect(resolveKeyboardShortcut({ key: "S" })).toBe("favorite");
  });

  test("resolves Delete and Backspace for delete to trash", () => {
    expect(resolveKeyboardShortcut({ key: "Delete" })).toBe("delete");
    expect(resolveKeyboardShortcut({ key: "Backspace" })).toBe("delete");
  });

  test("resolves Cmd/Ctrl combinations for clipboard and selection", () => {
    expect(resolveKeyboardShortcut({ key: "a", metaKey: true })).toBe("select_all");
    expect(resolveKeyboardShortcut({ key: "c", ctrlKey: true })).toBe("copy_tags");
    expect(resolveKeyboardShortcut({ key: "v", metaKey: true })).toBe("paste_tags");
  });
});

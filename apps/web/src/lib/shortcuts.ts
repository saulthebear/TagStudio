export type ShortcutCategory =
  | "Navigation"
  | "View & Media"
  | "Tagging & Metadata"
  | "Selection & Edit";

export type ShortcutScope = "global" | "grid" | "fullscreen";

export type KeyCombo = {
  key: string;
  mod?: boolean;
  shift?: boolean;
  alt?: boolean;
};

export type ShortcutDefinition = {
  id: string;
  name: string;
  description: string;
  category: ShortcutCategory;
  scope: ShortcutScope;
  combos: KeyCombo[];
  displayCombos: string[];
  allowInInputs?: boolean;
};

export const SHORTCUT_REGISTRY: ShortcutDefinition[] = [
  {
    id: "toggle-fullscreen",
    name: "Toggle Full Screen Mode",
    description: "Enter or exit full screen media preview",
    category: "View & Media",
    scope: "global",
    combos: [{ key: "f" }, { key: "F" }],
    displayCombos: ["F"]
  },
  {
    id: "toggle-favorite",
    name: "Toggle Favorite Tag",
    description: "Add or remove Favorite tag on selected entries",
    category: "Tagging & Metadata",
    scope: "global",
    combos: [{ key: "F", shift: true }, { key: "s" }, { key: "S" }],
    displayCombos: ["Shift + F", "S"]
  },
  {
    id: "toggle-mute",
    name: "Toggle Video Mute",
    description: "Mute or unmute video preview audio",
    category: "View & Media",
    scope: "global",
    combos: [{ key: "m" }, { key: "M" }],
    displayCombos: ["M"]
  },
  {
    id: "toggle-add-tags",
    name: "Add Tags Modal",
    description: "Open or toggle Add Tags modal for selected entries",
    category: "Tagging & Metadata",
    scope: "global",
    combos: [{ key: "t" }, { key: "T" }],
    displayCombos: ["T"]
  },
  {
    id: "toggle-metadata",
    name: "Toggle Metadata Panel",
    description: "Show or hide side metadata drawer in full screen view",
    category: "View & Media",
    scope: "fullscreen",
    combos: [{ key: "i" }, { key: "I" }],
    displayCombos: ["I"]
  },
  {
    id: "delete-entries",
    name: "Move to Trash",
    description: "Move selected entries to Trash",
    category: "Selection & Edit",
    scope: "global",
    combos: [{ key: "Delete" }, { key: "Backspace" }],
    displayCombos: ["Del", "Backspace"]
  },
  {
    id: "select-all",
    name: "Select All Entries",
    description: "Select all visible entries in current view",
    category: "Selection & Edit",
    scope: "grid",
    combos: [{ key: "a", mod: true }, { key: "A", mod: true }],
    displayCombos: ["⌘ A / Ctrl A"]
  },
  {
    id: "copy-tags",
    name: "Copy Tags",
    description: "Copy applied tags from selected entry",
    category: "Tagging & Metadata",
    scope: "grid",
    combos: [{ key: "c", mod: true }, { key: "C", mod: true }],
    displayCombos: ["⌘ C / Ctrl C"]
  },
  {
    id: "paste-tags",
    name: "Paste Tags",
    description: "Paste copied tags onto selected entries",
    category: "Tagging & Metadata",
    scope: "grid",
    combos: [{ key: "v", mod: true }, { key: "V", mod: true }],
    displayCombos: ["⌘ V / Ctrl V"]
  },
  {
    id: "navigate-prev",
    name: "Previous Entry",
    description: "Navigate to previous item in list or full screen view",
    category: "Navigation",
    scope: "global",
    combos: [{ key: "ArrowLeft" }],
    displayCombos: ["← Left Arrow"]
  },
  {
    id: "navigate-next",
    name: "Next Entry",
    description: "Navigate to next item in list or full screen view",
    category: "Navigation",
    scope: "global",
    combos: [{ key: "ArrowRight" }],
    displayCombos: ["→ Right Arrow"]
  },
  {
    id: "show-help",
    name: "Keyboard Shortcuts Help",
    description: "Open keyboard shortcuts cheat sheet modal",
    category: "Navigation",
    scope: "global",
    combos: [{ key: "?", shift: true }, { key: "/", mod: true }],
    displayCombos: ["?", "⌘ /"]
  }
];

export type LikeKeyboardEvent = {
  key: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  target?: EventTarget | null;
};

export function isInputActive(target: EventTarget | null | undefined): boolean {
  if (!target || !(target instanceof HTMLElement)) {
    return false;
  }
  const tagName = target.tagName;
  return (
    tagName === "INPUT" ||
    tagName === "TEXTAREA" ||
    tagName === "SELECT" ||
    target.isContentEditable ||
    target.getAttribute("role") === "textbox"
  );
}

export function matchesCombo(event: LikeKeyboardEvent, combo: KeyCombo): boolean {
  const eventKey = event.key;
  const modRequired = Boolean(combo.mod);
  const eventMod = Boolean(event.metaKey || event.ctrlKey);

  if (modRequired !== eventMod) {
    return false;
  }

  const shiftRequired = Boolean(combo.shift);
  if (shiftRequired !== Boolean(event.shiftKey)) {
    return false;
  }

  const altRequired = Boolean(combo.alt);
  if (altRequired !== Boolean(event.altKey)) {
    return false;
  }

  if (combo.key.length === 1) {
    return eventKey.toLowerCase() === combo.key.toLowerCase();
  }

  return eventKey === combo.key;
}

export function findMatchingShortcut(
  event: LikeKeyboardEvent,
  scopeFilter?: ShortcutScope
): ShortcutDefinition | null {
  if (isInputActive(event.target)) {
    return null;
  }

  for (const def of SHORTCUT_REGISTRY) {
    if (scopeFilter && def.scope !== "global" && def.scope !== scopeFilter) {
      continue;
    }

    for (const combo of def.combos) {
      if (matchesCombo(event, combo)) {
        return def;
      }
    }
  }

  return null;
}

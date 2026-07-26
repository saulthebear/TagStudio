import { useEffect, useRef } from "react";

import { isInputActive, matchesCombo, SHORTCUT_REGISTRY } from "@/lib/shortcuts";

export type UseKeyboardShortcutOptions = {
  enabled?: boolean;
};

export function useKeyboardShortcut(
  shortcutId: string,
  handler: () => void,
  options?: UseKeyboardShortcutOptions
) {
  const enabled = options?.enabled ?? true;
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const def = SHORTCUT_REGISTRY.find((s) => s.id === shortcutId);
    if (!def) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (isInputActive(event.target) && !def.allowInInputs) {
        return;
      }

      for (const combo of def.combos) {
        if (matchesCombo(event, combo)) {
          event.preventDefault();
          handlerRef.current();
          return;
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, shortcutId]);
}

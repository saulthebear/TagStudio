import { Button } from "@tagstudio/ui";
import { Keyboard, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { ModalHeader } from "@/components/ModalHeader";
import { ModalLayerPortal } from "@/components/ModalLayerPortal";
import { useDraggableModalPosition } from "@/hooks/useDraggableModalPosition";
import { SHORTCUT_REGISTRY, type ShortcutCategory, type ShortcutDefinition } from "@/lib/shortcuts";

type KeyboardShortcutsHelpModalProps = {
  open: boolean;
  onClose: () => void;
};

const CATEGORIES: ShortcutCategory[] = [
  "Navigation",
  "View & Media",
  "Tagging & Metadata",
  "Selection & Edit"
];

export function KeyboardShortcutsHelpModal({ open, onClose }: KeyboardShortcutsHelpModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const { panelRef, panelStyle, dragHandleProps, isDragging } = useDraggableModalPosition({
    open,
    margin: 16,
    initialPlacement: "center",
    panelId: "keyboard-shortcuts-modal"
  });

  const filteredShortcuts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return SHORTCUT_REGISTRY;
    }
    return SHORTCUT_REGISTRY.filter((shortcut) => {
      const matchName = shortcut.name.toLowerCase().includes(query);
      const matchDesc = shortcut.description.toLowerCase().includes(query);
      const matchCategory = shortcut.category.toLowerCase().includes(query);
      const matchCombos = shortcut.displayCombos.some((combo) => combo.toLowerCase().includes(query));
      return matchName || matchDesc || matchCategory || matchCombos;
    });
  }, [searchQuery]);

  const shortcutsByCategory = useMemo(() => {
    const map = new Map<ShortcutCategory, ShortcutDefinition[]>();
    for (const cat of CATEGORIES) {
      map.set(cat, []);
    }

    for (const shortcut of filteredShortcuts) {
      const list = map.get(shortcut.category) ?? [];
      list.push(shortcut);
      map.set(shortcut.category, list);
    }
    return map;
  }, [filteredShortcuts]);

  if (!open) {
    return null;
  }

  return (
    <ModalLayerPortal open={open} dimBackdrop={true} onBackdropClick={onClose}>
      <div
        ref={panelRef}
        className={`overlay-panel panel shortcuts-help-panel modal-draggable-panel ${isDragging ? "modal-panel-dragging" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard Shortcuts Help"
        onClick={(event) => event.stopPropagation()}
        style={{ width: 620, maxWidth: "92vw", maxHeight: "85vh", display: "flex", flexDirection: "column", ...panelStyle }}
      >
        <ModalHeader
          title="Keyboard Shortcuts"
          icon={<Keyboard className="h-5 w-5 text-blue-500" />}
          dragHandleProps={dragHandleProps}
          onClose={onClose}
        />

        {/* Search Bar */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            className="input-base pl-9 pr-3 w-full"
            placeholder="Search shortcuts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
          />
        </div>

        {/* Shortcuts List */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {filteredShortcuts.length === 0 ? (
            <p className="text-center text-sm text-slate-500 py-6">No shortcuts matching &quot;{searchQuery}&quot;</p>
          ) : (
            CATEGORIES.map((category) => {
              const list = shortcutsByCategory.get(category) ?? [];
              if (list.length === 0) {
                return null;
              }

              return (
                <div key={category} className="space-y-1.5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 px-1">
                    {category}
                  </h3>
                  <div className="rounded-xl border border-[var(--color-border-soft)] bg-white/60 dark:bg-slate-900/60 divide-y divide-[var(--color-border-soft)]">
                    {list.map((shortcut) => (
                      <div
                        key={shortcut.id}
                        className="flex items-center justify-between px-3 py-2 text-sm transition-colors hover:bg-slate-500/5"
                      >
                        <div className="min-w-0 pr-3">
                          <div className="font-medium text-slate-800 dark:text-slate-200">{shortcut.name}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                            {shortcut.description}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {shortcut.displayCombos.map((comboStr, idx) => (
                            <span key={`${shortcut.id}-${idx}`} className="flex items-center gap-1">
                              {idx > 0 ? <span className="text-xs text-slate-400 font-mono">or</span> : null}
                              <kbd className="inline-flex items-center rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-mono font-semibold text-slate-700 dark:text-slate-300 shadow-xs">
                                {comboStr}
                              </kbd>
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="mt-3 pt-3 border-t border-[var(--color-border-soft)] flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </ModalLayerPortal>
  );
}

import { type SortingMode } from "@tagstudio/api-client";
import { Button } from "@tagstudio/ui";

import { ModalHeader } from "@/components/ModalHeader";
import { ModalLayerPortal } from "@/components/ModalLayerPortal";
import { useDraggableModalPosition } from "@/hooks/useDraggableModalPosition";
import { type ThemeMode } from "@/hooks/useTheme";

type SettingsModalProps = {
  open: boolean;
  theme: ThemeMode;
  sortingMode: SortingMode;
  ascending: boolean;
  showHiddenEntries: boolean;
  pageSize: number;
  confirmBeforeTrash: boolean;
  savePending: boolean;
  onThemeChange: (theme: ThemeMode) => void;
  onSortingModeChange: (value: SortingMode) => void;
  onAscendingChange: (value: boolean) => void;
  onShowHiddenChange: (value: boolean) => void;
  onPageSizeChange: (value: number) => void;
  onConfirmBeforeTrashChange: (value: boolean) => void;
  onOpenShortcutsHelp?: () => void;
  onSave: () => void;
  onClose: () => void;
};

const SORTING_OPTIONS: Array<{ label: string; value: SortingMode }> = [
  { label: "Recently Added", value: "file.date_added" },
  { label: "Pathname", value: "file.path" },
  { label: "Random", value: "sorting.mode.random" }
];

export function SettingsModal({
  open,
  theme,
  sortingMode,
  ascending,
  showHiddenEntries,
  pageSize,
  confirmBeforeTrash,
  savePending,
  onThemeChange,
  onSortingModeChange,
  onAscendingChange,
  onShowHiddenChange,
  onPageSizeChange,
  onConfirmBeforeTrashChange,
  onOpenShortcutsHelp,
  onSave,
  onClose
}: SettingsModalProps) {
  const { panelRef, panelStyle, dragHandleProps, isDragging } = useDraggableModalPosition({
    open,
    margin: 16,
    initialPlacement: "center",
    panelId: "settings-modal"
  });

  if (!open) {
    return null;
  }

  return (
    <ModalLayerPortal open={open} dimBackdrop={true} onBackdropClick={onClose}>
      <div
        ref={panelRef}
        className={`overlay-panel panel modal-draggable-panel ${isDragging ? "modal-panel-dragging" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="App settings"
        style={panelStyle}
        onClick={(event) => event.stopPropagation()}
      >
        <ModalHeader title="App Settings" dragHandleProps={dragHandleProps} onClose={onClose} />

        <label className="settings-row">
          <span>Theme</span>
          <select
            className="input-base"
            value={theme}
            onChange={(event) => onThemeChange(event.target.value as ThemeMode)}
          >
            <option value="system">System (Auto)</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>

        <label className="settings-row">
          <span>Default sort</span>
          <select
            className="input-base"
            value={sortingMode}
            onChange={(event) => onSortingModeChange(event.target.value as SortingMode)}
          >
            {SORTING_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="settings-row">
          <span>Direction</span>
          <select
            className="input-base"
            value={ascending ? "asc" : "desc"}
            onChange={(event) => onAscendingChange(event.target.value === "asc")}
          >
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </label>

        <label className="settings-row">
          <span>Page size</span>
          <input
            className="input-base"
            type="number"
            min={20}
            max={2000}
            value={pageSize}
            onChange={(event) => onPageSizeChange(Math.max(20, Number(event.target.value) || 20))}
          />
        </label>

        <label className="settings-row settings-checkbox">
          <input
            className="toggle-base"
            type="checkbox"
            checked={showHiddenEntries}
            onChange={(event) => onShowHiddenChange(event.target.checked)}
          />
          <span>Show hidden entries by default</span>
        </label>

        <label className="settings-row settings-checkbox">
          <input
            className="toggle-base"
            type="checkbox"
            checked={confirmBeforeTrash}
            onChange={(event) => onConfirmBeforeTrashChange(event.target.checked)}
          />
          <span>Ask before moving files to Trash</span>
        </label>

        {onOpenShortcutsHelp ? (
          <div className="settings-row flex items-center justify-between pt-1">
            <span>Keyboard Shortcuts</span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                onClose();
                onOpenShortcutsHelp();
              }}
            >
              View Shortcuts (?)
            </Button>
          </div>
        ) : null}

        <div className="overlay-panel-actions">
          <Button onClick={onSave} disabled={savePending}>
            Save Defaults
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </ModalLayerPortal>
  );
}


import { type SortingMode } from "@tagstudio/api-client";
import { Button } from "@tagstudio/ui";

type SettingsModalProps = {
  open: boolean;
  sortingMode: SortingMode;
  ascending: boolean;
  showHiddenEntries: boolean;
  pageSize: number;
  savePending: boolean;
  onSortingModeChange: (value: SortingMode) => void;
  onAscendingChange: (value: boolean) => void;
  onShowHiddenChange: (value: boolean) => void;
  onPageSizeChange: (value: number) => void;
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
  sortingMode,
  ascending,
  showHiddenEntries,
  pageSize,
  savePending,
  onSortingModeChange,
  onAscendingChange,
  onShowHiddenChange,
  onPageSizeChange,
  onSave,
  onClose
}: SettingsModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="overlay" role="presentation" onClick={onClose}>
      <div
        className="overlay-panel panel"
        role="dialog"
        aria-modal="true"
        aria-label="Search settings"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="panel-title mt-0">Search Defaults</h2>

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

        <div className="overlay-panel-actions">
          <Button onClick={onSave} disabled={savePending}>
            Save Defaults
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

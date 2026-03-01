import { type SortingMode } from "@tagstudio/api-client";
import { Button } from "@tagstudio/ui";

export const SORTING_OPTIONS: Array<{ label: string; value: SortingMode }> = [
  { label: "Date Added", value: "file.date_added" },
  { label: "Filename", value: "generic.filename" },
  { label: "Path", value: "file.path" },
  { label: "Random", value: "sorting.mode.random" }
];

type SearchControlsPanelProps = {
  searchInput: string;
  sortingMode: SortingMode;
  ascending: boolean;
  showHiddenEntries: boolean;
  pageSize: number;
  isLibraryOpen: boolean;
  searchPending: boolean;
  saveSettingsPending: boolean;
  refreshPending: boolean;
  onSearchInputChange: (value: string) => void;
  onSortingModeChange: (value: SortingMode) => void;
  onAscendingChange: (value: boolean) => void;
  onShowHiddenChange: (value: boolean) => void;
  onPageSizeChange: (value: number) => void;
  onSearch: () => void;
  onSaveSettings: () => void;
  onRefresh: () => void;
};

export function SearchControlsPanel({
  searchInput,
  sortingMode,
  ascending,
  showHiddenEntries,
  pageSize,
  isLibraryOpen,
  searchPending,
  saveSettingsPending,
  refreshPending,
  onSearchInputChange,
  onSortingModeChange,
  onAscendingChange,
  onShowHiddenChange,
  onPageSizeChange,
  onSearch,
  onSaveSettings,
  onRefresh
}: SearchControlsPanelProps) {
  return (
    <section className="panel mb-4 grid gap-3 md:grid-cols-5">
      <input
        className="input-base md:col-span-3"
        placeholder='Search query (e.g. tag:"foo" or path:"*.png")'
        value={searchInput}
        onChange={(event) => onSearchInputChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            onSearch();
          }
        }}
      />
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
      <Button disabled={!isLibraryOpen || searchPending} onClick={onSearch}>
        Search
      </Button>
      <label className="inline-flex items-center gap-2 rounded-lg bg-white/80 px-3 py-2 text-sm text-slate-700">
        <input className="toggle-base" type="checkbox" checked={ascending} onChange={(event) => onAscendingChange(event.target.checked)} />
        Ascending
      </label>
      <label className="inline-flex items-center gap-2 rounded-lg bg-white/80 px-3 py-2 text-sm text-slate-700">
        <input
          className="toggle-base"
          type="checkbox"
          checked={showHiddenEntries}
          onChange={(event) => onShowHiddenChange(event.target.checked)}
        />
        Show hidden
      </label>
      <label className="inline-flex items-center gap-2 rounded-lg bg-white/80 px-3 py-2 text-sm text-slate-700">
        <span>Page size</span>
        <input
          className="input-base w-24 px-2 py-1"
          type="number"
          min={1}
          max={2000}
          value={pageSize}
          onChange={(event) => onPageSizeChange(Math.max(1, Number(event.target.value) || 1))}
        />
      </label>
      <Button variant="secondary" onClick={onSaveSettings} disabled={saveSettingsPending}>
        Save Settings
      </Button>
      <Button variant="secondary" onClick={onRefresh} disabled={!isLibraryOpen || refreshPending}>
        Refresh Library
      </Button>
    </section>
  );
}

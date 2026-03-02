import { type SortingMode } from "@tagstudio/api-client";
import { Button } from "@tagstudio/ui";

type TopFilterBarProps = {
  libraryPath: string;
  searchInput: string;
  activeQuery: string;
  sortingMode: SortingMode;
  ascending: boolean;
  showHiddenEntries: boolean;
  totalCount: number;
  searchPending: boolean;
  refreshPending: boolean;
  onSearchInputChange: (value: string) => void;
  onSearch: () => void;
  onSortingModeChange: (value: SortingMode) => void;
  onAscendingChange: (value: boolean) => void;
  onShowHiddenChange: (value: boolean) => void;
  onOpenLibraryModal: () => void;
  onRefresh: () => void;
  onOpenSettings: () => void;
};

const SORTING_OPTIONS: Array<{ label: string; value: SortingMode }> = [
  { label: "Recently Added", value: "file.date_added" },
  { label: "Pathname", value: "file.path" },
  { label: "Random", value: "sorting.mode.random" }
];

export function TopFilterBar({
  libraryPath,
  searchInput,
  activeQuery,
  sortingMode,
  ascending,
  showHiddenEntries,
  totalCount,
  searchPending,
  refreshPending,
  onSearchInputChange,
  onSearch,
  onSortingModeChange,
  onAscendingChange,
  onShowHiddenChange,
  onOpenLibraryModal,
  onRefresh,
  onOpenSettings
}: TopFilterBarProps) {
  return (
    <section className="top-filter-bar panel">
      <button
        type="button"
        className="library-chip"
        onClick={onOpenLibraryModal}
        aria-label="Open library switcher"
      >
        {libraryPath}
      </button>

      <input
        className="input-base top-filter-search"
        placeholder='Search entries (e.g. tag:"favorite" or path:"*.png")'
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

      <select
        className="input-base"
        value={ascending ? "asc" : "desc"}
        onChange={(event) => onAscendingChange(event.target.value === "asc")}
      >
        <option value="desc">Descending</option>
        <option value="asc">Ascending</option>
      </select>

      <label className="top-filter-checkbox" htmlFor="show-hidden-toggle">
        <input
          id="show-hidden-toggle"
          className="toggle-base"
          type="checkbox"
          checked={showHiddenEntries}
          onChange={(event) => onShowHiddenChange(event.target.checked)}
        />
        Hidden
      </label>

      <Button variant="secondary" disabled={searchPending} onClick={onSearch}>
        Search
      </Button>

      <Button variant="secondary" disabled={refreshPending} onClick={onRefresh}>
        Refresh
      </Button>

      <Button variant="secondary" onClick={onOpenSettings}>
        Settings
      </Button>

      <div className="top-filter-status" aria-live="polite">
        Results: <strong>{totalCount}</strong> {activeQuery ? `| Filter: ${activeQuery}` : "| Filter: none"}
      </div>
    </section>
  );
}

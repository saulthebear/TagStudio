import { type SortingMode } from "@tagstudio/api-client";
import { Button } from "@tagstudio/ui";
import { SlidersHorizontal } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";

type TopFilterBarProps = {
  libraryPath: string;
  searchInput: string;
  filterSummary: string;
  sortingMode: SortingMode;
  ascending: boolean;
  untaggedChecked: boolean;
  showUntaggedConflict: boolean;
  showConservativeHint: boolean;
  showHiddenEntries: boolean;
  activeFilterCount: number;
  totalCount: number;
  searchPending: boolean;
  refreshPending: boolean;
  onSearchInputChange: (value: string) => void;
  onSearch: () => void;
  onSortingModeChange: (value: SortingMode) => void;
  onAscendingChange: (value: boolean) => void;
  onUntaggedChange: (value: boolean) => void;
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
  filterSummary,
  sortingMode,
  ascending,
  untaggedChecked,
  showUntaggedConflict,
  showConservativeHint,
  showHiddenEntries,
  activeFilterCount,
  totalCount,
  searchPending,
  refreshPending,
  onSearchInputChange,
  onSearch,
  onSortingModeChange,
  onAscendingChange,
  onUntaggedChange,
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

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={`filter-trigger ${showUntaggedConflict ? "filter-trigger-warning" : ""}`}
            aria-label="Open filters menu"
            title="Open filters menu"
          >
            <SlidersHorizontal size={16} />
            <span>Filters</span>
            {activeFilterCount > 0 ? (
              <span
                className={`filter-badge ${showUntaggedConflict ? "filter-badge-warning" : ""}`}
              >
                {activeFilterCount}
              </span>
            ) : null}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="top-filter-dropdown" align="start">
          <DropdownMenuLabel className="top-filter-dropdown-label">
            Entry Filters
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="top-filter-dropdown-separator" />
          <DropdownMenuCheckboxItem
            checked={untaggedChecked}
            onCheckedChange={(value) => onUntaggedChange(value === true)}
          >
            Untagged
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={showHiddenEntries}
            onCheckedChange={(value) => onShowHiddenChange(value === true)}
          >
            Show hidden entries
          </DropdownMenuCheckboxItem>
          {showUntaggedConflict ? (
            <p className="top-filter-dropdown-hint top-filter-dropdown-hint-warning">
              `Untagged` with `tag:` or `tag_id:` usually returns zero results.
            </p>
          ) : null}
          {showConservativeHint ? (
            <p className="top-filter-dropdown-hint">
              Advanced query detected. Untagged token removal is conservative.
            </p>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <select
        className="input-base top-filter-sort-mode"
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
        className="input-base top-filter-sort-direction"
        value={ascending ? "asc" : "desc"}
        onChange={(event) => onAscendingChange(event.target.value === "asc")}
      >
        <option value="desc">Descending</option>
        <option value="asc">Ascending</option>
      </select>

      <Button
        variant="secondary"
        size="md"
        className="top-filter-action top-filter-search-action"
        disabled={searchPending}
        onClick={onSearch}
      >
        Search
      </Button>

      <Button
        variant="secondary"
        size="md"
        className="top-filter-action top-filter-refresh-action"
        disabled={refreshPending}
        onClick={onRefresh}
      >
        Refresh
      </Button>

      <Button
        variant="secondary"
        size="md"
        className="top-filter-action top-filter-settings-action"
        onClick={onOpenSettings}
      >
        Settings
      </Button>

      <div className="top-filter-status" aria-live="polite">
        Results: <strong>{totalCount}</strong> | Filter: {filterSummary}
      </div>
    </section>
  );
}

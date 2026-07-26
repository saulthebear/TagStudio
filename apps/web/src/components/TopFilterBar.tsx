import { type SortingMode } from "@tagstudio/api-client";
import { Button } from "@tagstudio/ui";
import { ArrowUpDown, Keyboard, RefreshCw, Settings, SlidersHorizontal, Volume2, VolumeX } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { type ThemeMode } from "@/hooks/useTheme";

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
  searchResultsStale: boolean;
  videoMuted: boolean;
  theme?: ThemeMode;
  onSearchInputChange: (value: string) => void;
  onSearch: () => void;
  onSortingModeChange: (value: SortingMode) => void;
  onAscendingChange: (value: boolean) => void;
  onUntaggedChange: (value: boolean) => void;
  onShowHiddenChange: (value: boolean) => void;
  onOpenLibraryModal: () => void;
  onRefresh: () => void;
  onOpenSettings: () => void;
  onToggleMute: () => void;
  onOpenShortcutsHelp?: () => void;
  onThemeChange?: (theme: ThemeMode) => void;
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
  refreshPending,
  searchResultsStale,
  videoMuted,
  theme,
  onSearchInputChange,
  onSearch,
  onSortingModeChange,
  onAscendingChange,
  onUntaggedChange,
  onShowHiddenChange,
  onOpenLibraryModal,
  onRefresh,
  onOpenSettings,
  onToggleMute,
  onOpenShortcutsHelp,
  onThemeChange
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
            className={`filter-icon-btn ${showUntaggedConflict ? "border-amber-500" : ""}`}
            aria-label="Open view settings"
            title="Open view settings"
          >
            <SlidersHorizontal size={18} />
            {activeFilterCount > 0 ? (
              <span
                className={`filter-badge absolute -top-2 -right-2 ${showUntaggedConflict ? "filter-badge-warning" : ""}`}
              >
                {activeFilterCount}
              </span>
            ) : null}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="top-filter-dropdown" align="start">
          <DropdownMenuLabel className="top-filter-dropdown-label">
            Sort By
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="top-filter-dropdown-separator" />
          {SORTING_OPTIONS.map((option) => (
            <DropdownMenuCheckboxItem
              key={option.value}
              checked={sortingMode === option.value}
              onCheckedChange={() => onSortingModeChange(option.value)}
              onSelect={(e) => e.preventDefault()}
            >
              {option.label}
            </DropdownMenuCheckboxItem>
          ))}
          <DropdownMenuSeparator className="top-filter-dropdown-separator" />
          <DropdownMenuCheckboxItem
            checked={ascending}
            onCheckedChange={() => onAscendingChange(!ascending)}
            onSelect={(e) => e.preventDefault()}
          >
            Ascending Order
          </DropdownMenuCheckboxItem>

          <DropdownMenuSeparator className="top-filter-dropdown-separator" />

          <DropdownMenuLabel className="top-filter-dropdown-label">
            Entry Filters
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="top-filter-dropdown-separator" />
          <DropdownMenuCheckboxItem
            checked={untaggedChecked}
            onCheckedChange={(value) => onUntaggedChange(value === true)}
            onSelect={(e) => e.preventDefault()}
          >
            Untagged
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={showHiddenEntries}
            onCheckedChange={(value) => onShowHiddenChange(value === true)}
            onSelect={(e) => e.preventDefault()}
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

          {onThemeChange && theme ? (
            <>
              <DropdownMenuSeparator className="top-filter-dropdown-separator" />
              <DropdownMenuLabel className="top-filter-dropdown-label">
                Theme
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="top-filter-dropdown-separator" />
              <DropdownMenuCheckboxItem
                checked={theme === "system"}
                onCheckedChange={() => onThemeChange("system")}
                onSelect={(e) => e.preventDefault()}
              >
                System (Auto)
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={theme === "light"}
                onCheckedChange={() => onThemeChange("light")}
                onSelect={(e) => e.preventDefault()}
              >
                Light
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={theme === "dark"}
                onCheckedChange={() => onThemeChange("dark")}
                onSelect={(e) => e.preventDefault()}
              >
                Dark
              </DropdownMenuCheckboxItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <button
        type="button"
        className="filter-icon-btn"
        disabled={refreshPending}
        onClick={onRefresh}
        title="Refresh"
        aria-label="Refresh"
      >
        <RefreshCw size={18} />
      </button>

      <button
        type="button"
        className="filter-icon-btn"
        onClick={onToggleMute}
        title={videoMuted ? "Unmute Videos" : "Mute Videos"}
        aria-label={videoMuted ? "Unmute Videos" : "Mute Videos"}
      >
        {videoMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
      </button>

      <button
        type="button"
        className="filter-icon-btn"
        onClick={onOpenSettings}
        title="Settings"
        aria-label="Settings"
      >
        <Settings size={18} />
      </button>

      <div className="top-filter-status" aria-live="polite">
        Results: <strong>{totalCount}</strong> | Filter: {filterSummary}
        {searchResultsStale ? (
          <>
            {" "}
            |{" "}
            <button type="button" className="top-filter-stale-pill" onClick={onSearch}>
              <span>Results are stale</span>
              <RefreshCw size={12} aria-hidden="true" />
            </button>
          </>
        ) : null}
      </div>
    </section>
  );
}

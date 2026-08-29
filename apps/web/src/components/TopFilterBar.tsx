import { useEffect, useId, useRef, useState } from "react";
import { type SortingMode } from "@tagstudio/api-client";
import {
  Activity,
  FolderOpen,
  Grid,
  Keyboard,
  RefreshCw,
  Settings,
  SlidersHorizontal,
  Tags,
  Volume2,
  VolumeX,
  X
} from "lucide-react";

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
  sortingMode: SortingMode;
  ascending: boolean;
  untaggedChecked: boolean;
  showUntaggedConflict: boolean;
  showConservativeHint: boolean;
  showHiddenEntries: boolean;
  activeFilterCount: number;
  searchPending: boolean;
  searchResultsStale: boolean;
  refreshPending: boolean;
  videoMuted: boolean;
  theme?: ThemeMode;
  activePage?: "grid" | "tags" | "observability";
  onNavigatePage?: (page: "grid" | "tags" | "observability") => void;
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
  onOpenDiagnostics?: () => void;
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
  sortingMode,
  ascending,
  untaggedChecked,
  showUntaggedConflict,
  showConservativeHint,
  showHiddenEntries,
  activeFilterCount,
  searchPending,
  searchResultsStale,
  refreshPending,
  videoMuted,
  theme,
  activePage = "grid",
  onNavigatePage,
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
  onOpenDiagnostics,
  onThemeChange
}: TopFilterBarProps) {
  const [isVaultExpanded, setIsVaultExpanded] = useState(false);
  const staleSearchHintId = useId();
  const vaultContainerRef = useRef<HTMLDivElement>(null);
  const vaultInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isVaultExpanded && vaultInputRef.current) {
      vaultInputRef.current.focus();
    }
  }, [isVaultExpanded]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        vaultContainerRef.current &&
        !vaultContainerRef.current.contains(event.target as Node)
      ) {
        setIsVaultExpanded(false);
      }
    }
    if (isVaultExpanded) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isVaultExpanded]);

  return (
    <section className="top-filter-bar panel">
      <div ref={vaultContainerRef} className="vault-control">
        {!isVaultExpanded ? (
          <button
            type="button"
            className="filter-icon-btn vault-icon-btn"
            onClick={() => setIsVaultExpanded(true)}
            aria-label="Open library switcher"
            title={`Vault: ${libraryPath || "None selected"}`}
          >
            <FolderOpen size={18} />
          </button>
        ) : (
          <div className="vault-expanded-box">
            <button
              type="button"
              className="vault-box-action"
              onClick={onOpenLibraryModal}
              title="Switch Vault"
              aria-label="Switch Vault"
            >
              <FolderOpen size={16} />
            </button>
            <input
              ref={vaultInputRef}
              type="text"
              readOnly
              className="input-base vault-input"
              value={libraryPath}
              title={`Vault: ${libraryPath}`}
              onClick={onOpenLibraryModal}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setIsVaultExpanded(false);
                } else if (e.key === "Enter") {
                  onOpenLibraryModal();
                }
              }}
              style={{
                width: `${Math.min(Math.max((libraryPath || "").length + 2, 8), 24)}ch`
              }}
            />
            <button
              type="button"
              className="vault-collapse-btn"
              onClick={() => setIsVaultExpanded(false)}
              title="Collapse Vault input"
              aria-label="Collapse Vault input"
            >
              <X size={14} />
            </button>
          </div>
        )}
      </div>

      <input
        className={`input-base top-filter-search ${searchResultsStale ? "top-filter-search-stale" : ""}`}
        placeholder='Search entries (e.g. tag:"favorite" or path:"*.png")'
        value={searchInput}
        aria-busy={searchPending}
        aria-describedby={searchResultsStale ? staleSearchHintId : undefined}
        onChange={(event) => onSearchInputChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            onSearch();
          }
        }}
      />
      {searchResultsStale ? (
        <span id={staleSearchHintId} className="sr-only">
          Results are stale. Press Enter to refresh them.
        </span>
      ) : null}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={`filter-icon-btn ${showUntaggedConflict ? "border-amber-500" : ""}`}
            aria-label="Filter options"
            title="Filter options"
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
            >
              {option.label}
            </DropdownMenuCheckboxItem>
          ))}
          <DropdownMenuSeparator className="top-filter-dropdown-separator" />
          <DropdownMenuCheckboxItem
            checked={ascending}
            onCheckedChange={() => onAscendingChange(!ascending)}
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
              >
                System (Auto)
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={theme === "light"}
                onCheckedChange={() => onThemeChange("light")}
              >
                Light
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={theme === "dark"}
                onCheckedChange={() => onThemeChange("dark")}
              >
                Dark
              </DropdownMenuCheckboxItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          type="button"
          className={`tag-nav-btn ${activePage === "grid" ? "tag-nav-btn-active" : ""}`}
          onClick={() => onNavigatePage?.("grid")}
          title="File Grid View"
          aria-label="File Grid View"
        >
          <Grid size={16} />
          <span className="hidden sm:inline">Grid</span>
        </button>
        <button
          type="button"
          className={`tag-nav-btn ${activePage === "tags" ? "tag-nav-btn-active" : ""}`}
          onClick={() => onNavigatePage?.("tags")}
          title="Tag Explorer View"
          aria-label="Tag Explorer View"
        >
          <Tags size={16} />
          <span className="hidden sm:inline">Tags</span>
        </button>
      </div>

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

      {onOpenShortcutsHelp ? (
        <button
          type="button"
          className="filter-icon-btn"
          onClick={onOpenShortcutsHelp}
          title="Keyboard Shortcuts"
          aria-label="Keyboard Shortcuts"
        >
          <Keyboard size={18} />
        </button>
      ) : null}

      {onOpenDiagnostics ? (
        <button
          type="button"
          className="filter-icon-btn"
          onClick={onOpenDiagnostics}
          title="System Diagnostics & Observability"
          aria-label="System Diagnostics & Observability"
        >
          <Activity size={18} />
        </button>
      ) : null}

      <button
        type="button"
        className="filter-icon-btn"
        onClick={onOpenSettings}
        title="Settings"
        aria-label="Settings"
      >
        <Settings size={18} />
      </button>
    </section>
  );
}

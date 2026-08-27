import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type RemuxMode, type RemuxOnImport, type SortingMode } from "@tagstudio/api-client";
import { Button } from "@tagstudio/ui";

import { api } from "@/api/client";
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
  remuxMode: RemuxMode;
  remuxOnImport: RemuxOnImport;
  savePending: boolean;
  onThemeChange: (theme: ThemeMode) => void;
  onSortingModeChange: (value: SortingMode) => void;
  onAscendingChange: (value: boolean) => void;
  onShowHiddenChange: (value: boolean) => void;
  onPageSizeChange: (value: number) => void;
  onConfirmBeforeTrashChange: (value: boolean) => void;
  onRemuxModeChange: (value: RemuxMode) => void;
  onRemuxOnImportChange: (value: RemuxOnImport) => void;
  onStartRemux?: () => void;
  remuxPending?: boolean;
  onOpenShortcutsHelp?: () => void;
  onOpenDiagnostics?: () => void;
  onSave: () => void;
  onClose: () => void;
};

const SORTING_OPTIONS: Array<{ label: string; value: SortingMode }> = [
  { label: "Recently Added", value: "file.date_added" },
  { label: "Pathname", value: "file.path" },
  { label: "Random", value: "sorting.mode.random" }
];

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function SettingsModal({
  open,
  theme,
  sortingMode,
  ascending,
  showHiddenEntries,
  pageSize,
  confirmBeforeTrash,
  remuxMode,
  remuxOnImport,
  savePending,
  onThemeChange,
  onSortingModeChange,
  onAscendingChange,
  onShowHiddenChange,
  onPageSizeChange,
  onConfirmBeforeTrashChange,
  onRemuxModeChange,
  onRemuxOnImportChange,
  onStartRemux,
  remuxPending = false,
  onOpenShortcutsHelp,
  onOpenDiagnostics,
  onSave,
  onClose
}: SettingsModalProps) {
  const queryClient = useQueryClient();
  const { panelRef, panelStyle, dragHandleProps, isDragging } = useDraggableModalPosition({
    open,
    margin: 16,
    initialPlacement: "center",
    panelId: "settings-modal"
  });

  const backupsQuery = useQuery({
    queryKey: ["remux-backups"],
    queryFn: () => api.getRemuxBackups(),
    enabled: open
  });

  const purgeMutation = useMutation({
    mutationFn: () => api.purgeRemuxBackups(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["remux-backups"] });
    }
  });

  if (!open) {
    return null;
  }

  const backupInfo = backupsQuery.data;

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

        <div className="my-2 border-t border-slate-200 dark:border-slate-800" />
        <div className="px-1 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Video Remuxing
        </div>

        <label className="settings-row">
          <span>Remux mode</span>
          <select
            className="input-base"
            value={remuxMode}
            onChange={(event) => onRemuxModeChange(event.target.value as RemuxMode)}
          >
            <option value="backup">Backup originals (Safe)</option>
            <option value="replace">Replace in-place (No backup)</option>
          </select>
        </label>

        <label className="settings-row">
          <span>On import</span>
          <select
            className="input-base"
            value={remuxOnImport}
            onChange={(event) => onRemuxOnImportChange(event.target.value as RemuxOnImport)}
          >
            <option value="off">Off</option>
            <option value="ask">Ask when needed</option>
            <option value="auto">Automatically remux</option>
          </select>
        </label>

        {onStartRemux ? (
          <div className="settings-row flex items-center justify-between pt-1">
            <span>Remux Library Videos</span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={remuxPending}
              onClick={onStartRemux}
            >
              {remuxPending ? "Remuxing..." : "Remux Videos"}
            </Button>
          </div>
        ) : null}

        {backupInfo && backupInfo.file_count > 0 ? (
          <div className="settings-row flex items-center justify-between pt-1">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Backups: {formatBytes(backupInfo.total_bytes)} ({backupInfo.file_count} file{backupInfo.file_count === 1 ? "" : "s"})
            </span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={purgeMutation.isPending}
              onClick={() => purgeMutation.mutate()}
            >
              {purgeMutation.isPending ? "Purging..." : "Purge Backups"}
            </Button>
          </div>
        ) : null}

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

        {onOpenDiagnostics ? (
          <div className="settings-row flex items-center justify-between pt-1">
            <span>System Diagnostics</span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                onClose();
                onOpenDiagnostics();
              }}
            >
              Observability & Logs
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

import { useEffect, useRef } from "react";
import { Button } from "@tagstudio/ui";

type LibrarySwitcherModalProps = {
  open: boolean;
  libraryPath: string;
  canPickDirectory: boolean;
  openPending: boolean;
  onLibraryPathChange: (value: string) => void;
  onBrowse: () => void;
  onOpen: () => void;
  onCreate: () => void;
  onClose: () => void;
};

export function LibrarySwitcherModal({
  open,
  libraryPath,
  canPickDirectory,
  openPending,
  onLibraryPathChange,
  onBrowse,
  onOpen,
  onCreate,
  onClose
}: LibrarySwitcherModalProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      return;
    }
    panelRef.current?.focus();
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div className="overlay" role="presentation" onClick={onClose}>
      <div
        ref={panelRef}
        className="overlay-panel panel"
        role="dialog"
        aria-modal="true"
        aria-label="Switch library"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="panel-title mt-0">Switch Library</h2>
        <input
          className="input-base"
          placeholder="/path/to/library"
          value={libraryPath}
          onChange={(event) => onLibraryPathChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") {
              return;
            }
            event.preventDefault();
            if (!libraryPath || openPending) {
              return;
            }
            onOpen();
          }}
        />
        <div className="overlay-panel-actions">
          <Button variant="secondary" disabled={!canPickDirectory} onClick={onBrowse}>
            Browse...
          </Button>
          <Button disabled={!libraryPath || openPending} onClick={onOpen}>
            Open Library
          </Button>
          <Button variant="secondary" disabled={!libraryPath || openPending} onClick={onCreate}>
            Create Library
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

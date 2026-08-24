import { useEffect } from "react";
import { Button } from "@tagstudio/ui";

import { ModalHeader } from "@/components/ModalHeader";
import { ModalLayerPortal } from "@/components/ModalLayerPortal";
import { useDraggableModalPosition } from "@/hooks/useDraggableModalPosition";

type LibrarySwitcherModalProps = {
  open: boolean;
  libraryPath: string;
  openPending: boolean;
  onLibraryPathChange: (value: string) => void;
  onOpen: () => void;
  onCreate: () => void;
  onClose: () => void;
};

export function LibrarySwitcherModal({
  open,
  libraryPath,
  openPending,
  onLibraryPathChange,
  onOpen,
  onCreate,
  onClose
}: LibrarySwitcherModalProps) {
  const { panelRef, panelStyle, dragHandleProps, isDragging } = useDraggableModalPosition({
    open,
    margin: 16,
    initialPlacement: "center",
    panelId: "library-switcher-modal"
  });

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
  }, [open, panelRef]);

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
        aria-label="Switch library"
        tabIndex={-1}
        style={panelStyle}
        onClick={(event) => event.stopPropagation()}
      >
        <ModalHeader title="Switch Library" dragHandleProps={dragHandleProps} onClose={onClose} />
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
    </ModalLayerPortal>
  );
}

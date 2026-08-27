import { type ReactNode, useEffect, useId } from "react";
import { createPortal } from "react-dom";

import { useModalStackDepth } from "@/hooks/useModalStackDepth";

export type ModalLayerPortalProps = {
  open: boolean;
  onBackdropClick?: () => void;
  onEscape?: () => void;
  zIndexBase?: number;
  dimBackdrop?: boolean;
  children: ReactNode;
};

export function ModalLayerPortal({
  open,
  onBackdropClick,
  onEscape,
  zIndexBase = 1000,
  dimBackdrop = true,
  children
}: ModalLayerPortalProps) {
  const modalId = useId();
  const { depth, isTopmost } = useModalStackDepth(modalId, open);

  useEffect(() => {
    if (!open || !isTopmost) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      if (event.defaultPrevented) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      const closeHandler = onEscape ?? onBackdropClick;
      closeHandler?.();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isTopmost, onBackdropClick, onEscape, open]);

  if (!open) {
    return null;
  }

  const resolvedDepth = depth < 0 ? 0 : depth;
  const resolvedTopmost = depth < 0 ? true : isTopmost;

  return createPortal(
    <div className="modal-layer" style={{ zIndex: zIndexBase + resolvedDepth * 20 }}>
      {dimBackdrop && depth === 0 ? <div className="modal-layer-backdrop modal-layer-backdrop-dim" /> : null}
      {resolvedTopmost ? (
        <div
          className="modal-layer-backdrop modal-layer-backdrop-clear"
          role="presentation"
          onClick={() => onBackdropClick?.()}
        />
      ) : null}
      <div className="modal-layer-panel">{children}</div>
    </div>,
    document.body
  );
}

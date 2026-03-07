import { type ReactNode, useId } from "react";
import { createPortal } from "react-dom";

import { useModalStackDepth } from "@/hooks/useModalStackDepth";

export type ModalLayerPortalProps = {
  open: boolean;
  onBackdropClick?: () => void;
  zIndexBase?: number;
  dimBackdrop?: boolean;
  children: ReactNode;
};

export function ModalLayerPortal({
  open,
  onBackdropClick,
  zIndexBase = 1000,
  dimBackdrop = true,
  children
}: ModalLayerPortalProps) {
  const modalId = useId();
  const { depth, isTopmost } = useModalStackDepth(modalId, open);

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

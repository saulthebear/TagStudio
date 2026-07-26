import { type ReactNode } from "react";
import { X } from "lucide-react";

export type ModalHeaderProps = {
  title: ReactNode;
  icon?: ReactNode;
  onClose?: () => void;
  dragHandleProps?: Record<string, unknown>;
  className?: string;
  children?: ReactNode;
};

export function ModalHeader({
  title,
  icon,
  onClose,
  dragHandleProps,
  className = "",
  children
}: ModalHeaderProps) {
  const isDraggable = Boolean(dragHandleProps);

  return (
    <div className={`modal-header flex items-center justify-between gap-2 pb-3 mb-3 border-b border-[var(--color-border-soft)] ${className}`}>
      <div
        className={`flex items-center gap-2 min-w-0 flex-1 ${isDraggable ? "modal-drag-handle cursor-grab active:cursor-grabbing" : ""}`}
        {...dragHandleProps}
      >
        {icon ? <span className="shrink-0 flex items-center">{icon}</span> : null}
        {typeof title === "string" ? (
          <h2 className="panel-title m-0 text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100 truncate">
            {title}
          </h2>
        ) : (
          title
        )}
      </div>
      {children ? <div className="flex items-center gap-2">{children}</div> : null}
      {onClose ? (
        <button
          type="button"
          className="modal-close-btn"
          onClick={onClose}
          aria-label="Close"
        >
          <X size={18} />
        </button>
      ) : null}
    </div>
  );
}

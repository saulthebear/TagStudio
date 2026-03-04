import type { PointerEvent } from "react";

type CollapsedRailProps = {
  orientation: "horizontal" | "vertical";
  side: "start" | "end";
  label: string;
  onToggle: () => void;
  onDragStart: (event: PointerEvent<HTMLDivElement>) => void;
};

function arrowFor(orientation: "horizontal" | "vertical", side: "start" | "end"): string {
  if (orientation === "horizontal") {
    return side === "start" ? "▶" : "◀";
  }
  return side === "start" ? "▼" : "▲";
}

export function CollapsedRail({ orientation, side, label, onToggle, onDragStart }: CollapsedRailProps) {
  const arrow = arrowFor(orientation, side);
  return (
    <div
      className={`collapsed-rail collapsed-rail-${orientation}`}
      onPointerDown={onDragStart}
      role="presentation"
      aria-label={`${label} collapsed rail`}
    >
      <button
        type="button"
        className="collapsed-rail-toggle"
        onClick={onToggle}
        onPointerDown={(event) => event.stopPropagation()}
        aria-label={`Expand ${label}`}
      >
        {arrow}
      </button>
    </div>
  );
}

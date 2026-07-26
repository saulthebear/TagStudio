import type { PointerEvent } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react";

type CollapsedRailProps = {
  orientation: "horizontal" | "vertical";
  side: "start" | "end";
  label: string;
  onToggle: () => void;
  onDragStart: (event: PointerEvent<HTMLDivElement>) => void;
};

function renderChevron(orientation: "horizontal" | "vertical", side: "start" | "end") {
  const className = "h-4 w-4 collapsed-rail-chevron";
  if (orientation === "horizontal") {
    return side === "start" ? <ChevronRight className={className} /> : <ChevronLeft className={className} />;
  }
  return side === "start" ? <ChevronDown className={className} /> : <ChevronUp className={className} />;
}

export function CollapsedRail({ orientation, side, label, onToggle, onDragStart }: CollapsedRailProps) {
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
        title={`Expand ${label}`}
      >
        {renderChevron(orientation, side)}
      </button>
    </div>
  );
}


import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useMemo,
  useRef
} from "react";

import { CollapsedRail } from "@/components/CollapsedRail";

export type SplitPaneState = {
  ratio: number;
  lastOpenRatio: number;
  primaryCollapsed: boolean;
  secondaryCollapsed: boolean;
};

type SplitPaneProps = {
  orientation: "horizontal" | "vertical";
  state: SplitPaneState;
  onStateChange: (next: SplitPaneState) => void;
  primary: ReactNode;
  secondary: ReactNode;
  primaryLabel: string;
  secondaryLabel: string;
  minPrimarySize: number;
  minSecondarySize: number;
  collapseThreshold: number;
  resetRatio: number;
  railSize: number;
  handleSize: number;
  className?: string;
};

type DragMode = "separator" | "rail-primary" | "rail-secondary";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampRatioWithMinimums(
  rawRatio: number,
  availablePx: number,
  minPrimarySize: number,
  minSecondarySize: number
): number {
  const minRatio = clamp(minPrimarySize / availablePx, 0.1, 0.9);
  const maxRatio = clamp(1 - minSecondarySize / availablePx, 0.1, 0.9);
  return clamp(rawRatio, minRatio, maxRatio);
}

function normalizeState(next: SplitPaneState): SplitPaneState {
  const normalized = {
    ...next,
    ratio: clamp(next.ratio, 0.1, 0.9),
    lastOpenRatio: clamp(next.lastOpenRatio, 0.1, 0.9)
  };

  if (normalized.primaryCollapsed && normalized.secondaryCollapsed) {
    normalized.secondaryCollapsed = false;
  }

  return normalized;
}

export function SplitPane({
  orientation,
  state,
  onStateChange,
  primary,
  secondary,
  primaryLabel,
  secondaryLabel,
  minPrimarySize,
  minSecondarySize,
  collapseThreshold,
  resetRatio,
  railSize,
  handleSize,
  className
}: SplitPaneProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const effectiveHandleSize = Math.max(handleSize, 24);

  const bothOpen = !state.primaryCollapsed && !state.secondaryCollapsed;

  const directionClass = orientation === "horizontal" ? "split-pane-horizontal" : "split-pane-vertical";
  const collapseClass = state.primaryCollapsed
    ? "split-pane-primary-collapsed"
    : state.secondaryCollapsed
      ? "split-pane-secondary-collapsed"
      : "split-pane-both-open";
  const singleOpenClass = bothOpen ? "" : "split-pane-single-open";

  const primaryStyle = useMemo(
    () => ({
      flexGrow: state.ratio,
      flexShrink: 1,
      flexBasis: "0%"
    }),
    [state.ratio]
  );

  const secondaryStyle = useMemo(
    () => ({
      flexGrow: 1 - state.ratio,
      flexShrink: 1,
      flexBasis: "0%"
    }),
    [state.ratio]
  );

  const updateState = (next: SplitPaneState) => {
    onStateChange(normalizeState(next));
  };

  const expandPrimary = () => {
    updateState({
      ...state,
      primaryCollapsed: false,
      secondaryCollapsed: false,
      ratio: state.lastOpenRatio,
      lastOpenRatio: state.lastOpenRatio
    });
  };

  const expandSecondary = () => {
    updateState({
      ...state,
      primaryCollapsed: false,
      secondaryCollapsed: false,
      ratio: state.lastOpenRatio,
      lastOpenRatio: state.lastOpenRatio
    });
  };

  const runPointerDrag = (mode: DragMode, startEvent: ReactPointerEvent<HTMLElement>) => {
    const root = rootRef.current;
    if (!root) {
      return;
    }

    const rect = root.getBoundingClientRect();
    const totalPx = orientation === "horizontal" ? rect.width : rect.height;
    if (totalPx <= 0) {
      return;
    }
    const availablePx = totalPx - effectiveHandleSize;
    if (availablePx <= 0) {
      return;
    }
    const halfHandle = effectiveHandleSize / 2;
    const toPrimarySize = (cursorPx: number) => {
      const boundaryPx = clamp(cursorPx, halfHandle, totalPx - halfHandle);
      return clamp(boundaryPx - halfHandle, 0, availablePx);
    };

    const onMove = (event: PointerEvent) => {
      const cursor = orientation === "horizontal" ? event.clientX - rect.left : event.clientY - rect.top;
      const clampedCursor = clamp(cursor, 0, totalPx);
      const primarySize = toPrimarySize(clampedCursor);
      const secondarySize = availablePx - primarySize;

      if (mode === "separator") {
        if (primarySize < collapseThreshold) {
          updateState({
            ...state,
            primaryCollapsed: true,
            secondaryCollapsed: false,
            lastOpenRatio: state.ratio
          });
          return;
        }

        if (secondarySize < collapseThreshold) {
          updateState({
            ...state,
            primaryCollapsed: false,
            secondaryCollapsed: true,
            lastOpenRatio: state.ratio
          });
          return;
        }

        const nextRatio = clampRatioWithMinimums(
          primarySize / availablePx,
          availablePx,
          minPrimarySize,
          minSecondarySize
        );

        updateState({
          ratio: nextRatio,
          lastOpenRatio: nextRatio,
          primaryCollapsed: false,
          secondaryCollapsed: false
        });
        return;
      }

      if (mode === "rail-primary") {
        if (primarySize < minPrimarySize) {
          return;
        }
        const nextRatio = clampRatioWithMinimums(
          primarySize / availablePx,
          availablePx,
          minPrimarySize,
          minSecondarySize
        );

        updateState({
          ratio: nextRatio,
          lastOpenRatio: nextRatio,
          primaryCollapsed: false,
          secondaryCollapsed: false
        });
        return;
      }

      if (mode === "rail-secondary") {
        if (secondarySize < minSecondarySize) {
          return;
        }
        const nextRatio = clampRatioWithMinimums(
          primarySize / availablePx,
          availablePx,
          minPrimarySize,
          minSecondarySize
        );
        updateState({
          ratio: nextRatio,
          lastOpenRatio: nextRatio,
          primaryCollapsed: false,
          secondaryCollapsed: false
        });
      }
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);

    startEvent.preventDefault();
  };

  const onSeparatorKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = 0.02;
    const horizontal = orientation === "horizontal";

    if (event.key === "Home") {
      event.preventDefault();
      updateState({
        ratio: resetRatio,
        lastOpenRatio: resetRatio,
        primaryCollapsed: false,
        secondaryCollapsed: false
      });
      return;
    }

    const isDecrease =
      (horizontal && event.key === "ArrowLeft") || (!horizontal && event.key === "ArrowUp");
    const isIncrease =
      (horizontal && event.key === "ArrowRight") || (!horizontal && event.key === "ArrowDown");

    if (!isDecrease && !isIncrease) {
      return;
    }

    event.preventDefault();

    const nextRatio = clamp(state.ratio + (isIncrease ? step : -step), 0.1, 0.9);
    updateState({
      ratio: nextRatio,
      lastOpenRatio: nextRatio,
      primaryCollapsed: false,
      secondaryCollapsed: false
    });
  };

  return (
    <div
      ref={rootRef}
      className={`split-pane ${directionClass} ${collapseClass} ${singleOpenClass} ${className ?? ""}`.trim()}
      style={
        {
          "--split-rail-size": `${railSize}px`,
          "--split-handle-size": `${effectiveHandleSize}px`
        } as CSSProperties
      }
    >
      {state.primaryCollapsed ? (
        <CollapsedRail
          orientation={orientation}
          side="start"
          label={primaryLabel}
          onToggle={expandPrimary}
          onDragStart={(event) => runPointerDrag("rail-primary", event)}
        />
      ) : (
        <div className="split-pane-region split-pane-region-primary" style={bothOpen ? primaryStyle : undefined}>
          {primary}
        </div>
      )}

      {bothOpen ? (
        <div
          role="separator"
          aria-orientation={orientation}
          aria-label={`${primaryLabel} and ${secondaryLabel} divider`}
          tabIndex={0}
          className="split-pane-handle"
          onPointerDown={(event) => runPointerDrag("separator", event)}
          onKeyDown={onSeparatorKeyDown}
          onDoubleClick={() =>
            updateState({
              ratio: resetRatio,
              lastOpenRatio: resetRatio,
              primaryCollapsed: false,
              secondaryCollapsed: false
            })
          }
        />
      ) : null}

      {state.secondaryCollapsed ? (
        <CollapsedRail
          orientation={orientation}
          side="end"
          label={secondaryLabel}
          onToggle={expandSecondary}
          onDragStart={(event) => runPointerDrag("rail-secondary", event)}
        />
      ) : (
        <div className="split-pane-region split-pane-region-secondary" style={bothOpen ? secondaryStyle : undefined}>
          {secondary}
        </div>
      )}
    </div>
  );
}

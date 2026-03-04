import {
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";

type UseDraggableModalPositionOptions = {
  open: boolean;
  margin?: number;
};

type DragState = {
  mode: "pointer" | "mouse";
  pointerId: number | null;
  offsetX: number;
  offsetY: number;
};

type DragPosition = {
  left: number;
  top: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampToViewport(panel: HTMLElement, next: DragPosition, margin: number): DragPosition {
  const rect = panel.getBoundingClientRect();
  const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin);
  const maxTop = Math.max(margin, window.innerHeight - rect.height - margin);

  return {
    left: clamp(next.left, margin, maxLeft),
    top: clamp(next.top, margin, maxTop)
  };
}

function centerInViewport(panel: HTMLElement, margin: number): DragPosition {
  const rect = panel.getBoundingClientRect();
  const centered = {
    left: (window.innerWidth - rect.width) / 2,
    top: (window.innerHeight - rect.height) / 2
  };
  return clampToViewport(panel, centered, margin);
}

export function useDraggableModalPosition({
  open,
  margin = 16
}: UseDraggableModalPositionOptions): {
  panelRef: RefObject<HTMLDivElement | null>;
  panelStyle: CSSProperties | undefined;
  dragHandleProps: {
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
    onMouseDown: (event: ReactMouseEvent<HTMLElement>) => void;
  };
  isDragging: boolean;
} {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const [position, setPosition] = useState<DragPosition | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!open) {
      if (dragCleanupRef.current) {
        dragCleanupRef.current();
        dragCleanupRef.current = null;
      }
      dragStateRef.current = null;
      setIsDragging(false);
      setPosition(null);
      document.body.classList.remove("modal-dragging");
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      if (!panelRef.current) {
        return;
      }
      setPosition(centerInViewport(panelRef.current, margin));
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [margin, open]);

  useEffect(() => {
    return () => {
      if (dragCleanupRef.current) {
        dragCleanupRef.current();
        dragCleanupRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onResize = () => {
      const panel = panelRef.current;
      if (!panel) {
        return;
      }

      setPosition((current) => {
        if (!current) {
          return centerInViewport(panel, margin);
        }
        return clampToViewport(panel, current, margin);
      });
    };

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [margin, open]);

  const startDrag = (args: {
    mode: "pointer" | "mouse";
    clientX: number;
    clientY: number;
    pointerId: number | null;
  }) => {
    if (!open || dragStateRef.current) {
      return;
    }

    const panel = panelRef.current;
    if (!panel) {
      return;
    }

    const rect = panel.getBoundingClientRect();
    dragStateRef.current = {
      mode: args.mode,
      pointerId: args.pointerId,
      offsetX: args.clientX - rect.left,
      offsetY: args.clientY - rect.top
    };
    setIsDragging(true);
    document.body.classList.add("modal-dragging");

    const onMove = (moveEvent: PointerEvent | MouseEvent) => {
      const dragState = dragStateRef.current;
      const panelElement = panelRef.current;
      if (!dragState || !panelElement) {
        return;
      }
      if (dragState.mode === "pointer" && "pointerId" in moveEvent && moveEvent.pointerId !== dragState.pointerId) {
        return;
      }

      moveEvent.preventDefault();
      const next = clampToViewport(
        panelElement,
        {
          left: moveEvent.clientX - dragState.offsetX,
          top: moveEvent.clientY - dragState.offsetY
        },
        margin
      );
      setPosition(next);
    };

    const removeListeners = () => {
      window.removeEventListener("pointermove", onMove as EventListener);
      window.removeEventListener("pointerup", onEnd as EventListener);
      window.removeEventListener("pointercancel", onEnd as EventListener);
      window.removeEventListener("mousemove", onMove as EventListener);
      window.removeEventListener("mouseup", onEnd as EventListener);
    };

    const onEnd = (endEvent: PointerEvent | MouseEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState) {
        return;
      }
      if (dragState.mode === "pointer" && "pointerId" in endEvent && endEvent.pointerId !== dragState.pointerId) {
        return;
      }

      removeListeners();
      dragCleanupRef.current = null;
      dragStateRef.current = null;
      setIsDragging(false);
      document.body.classList.remove("modal-dragging");
    };

    if (dragCleanupRef.current) {
      dragCleanupRef.current();
      dragCleanupRef.current = null;
    }

    if (args.mode === "pointer") {
      window.addEventListener("pointermove", onMove as EventListener, { passive: false });
      window.addEventListener("pointerup", onEnd as EventListener);
      window.addEventListener("pointercancel", onEnd as EventListener);
    } else {
      window.addEventListener("mousemove", onMove as EventListener);
      window.addEventListener("mouseup", onEnd as EventListener);
    }

    dragCleanupRef.current = removeListeners;
  };

  const onHandlePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) {
      return;
    }

    startDrag({
      mode: "pointer",
      clientX: event.clientX,
      clientY: event.clientY,
      pointerId: event.pointerId
    });
    event.preventDefault();
  };

  const onHandleMouseDown = (event: ReactMouseEvent<HTMLElement>) => {
    if (event.button !== 0) {
      return;
    }

    startDrag({
      mode: "mouse",
      clientX: event.clientX,
      clientY: event.clientY,
      pointerId: null
    });
    event.preventDefault();
  };

  const panelStyle = useMemo<CSSProperties | undefined>(() => {
    if (!position) {
      return undefined;
    }
    return {
      position: "fixed",
      left: position.left,
      top: position.top,
      margin: 0
    };
  }, [position]);

  return {
    panelRef,
    panelStyle,
    dragHandleProps: {
      onPointerDown: onHandlePointerDown,
      onMouseDown: onHandleMouseDown
    },
    isDragging
  };
}

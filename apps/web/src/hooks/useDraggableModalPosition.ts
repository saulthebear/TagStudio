import {
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";

type UseDraggableModalPositionOptions = {
  open: boolean;
  margin?: number;
  initialPlacement?: "center" | "left";
  initialOffset?: {
    left: number;
    top: number;
  };
  panelId?: string;
  savePositionOnClose?: boolean;
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

type ViewportSize = {
  width: number;
  height: number;
};

const POS_STORAGE_PREFIX = "tagstudio:panel-pos:";
const inMemoryPositions = new Map<string, DragPosition>();

export function getSavedPanelPosition(panelId?: string): DragPosition | null {
  if (!panelId) {
    return null;
  }
  const memoryPos = inMemoryPositions.get(panelId);
  if (memoryPos) {
    return memoryPos;
  }
  if (typeof localStorage !== "undefined") {
    try {
      const raw = localStorage.getItem(`${POS_STORAGE_PREFIX}${panelId}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed?.left === "number" && typeof parsed?.top === "number") {
          inMemoryPositions.set(panelId, parsed);
          return parsed;
        }
      }
    } catch {
      // Ignore storage errors
    }
  }
  return null;
}

export function savePanelPosition(panelId: string, pos: DragPosition): void {
  inMemoryPositions.set(panelId, pos);
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(`${POS_STORAGE_PREFIX}${panelId}`, JSON.stringify(pos));
    } catch {
      // Ignore storage errors
    }
  }
}

export function clearSavedPanelPosition(panelId: string): void {
  inMemoryPositions.delete(panelId);
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.removeItem(`${POS_STORAGE_PREFIX}${panelId}`);
    } catch {
      // Ignore storage errors
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getViewportSize(): ViewportSize {
  if (window.visualViewport) {
    return {
      width: window.visualViewport.width,
      height: window.visualViewport.height
    };
  }

  return {
    width: document.documentElement.clientWidth,
    height: document.documentElement.clientHeight
  };
}

function clampToViewport(
  panelWidth: number,
  panelHeight: number,
  next: DragPosition,
  margin: number
): DragPosition {
  const { width, height } = getViewportSize();
  const maxLeft = Math.max(margin, width - panelWidth - margin);
  const maxTop = Math.max(margin, height - panelHeight - margin);
  return {
    left: clamp(next.left, margin, maxLeft),
    top: clamp(next.top, margin, maxTop)
  };
}

function centerInViewport(panel: HTMLElement, margin: number): DragPosition {
  const rect = panel.getBoundingClientRect();
  const { width, height } = getViewportSize();
  const centered = {
    left: (width - rect.width) / 2,
    top: (height - rect.height) / 2
  };
  return clampToViewport(rect.width, rect.height, centered, margin);
}

function placeInViewport(
  panel: HTMLElement,
  margin: number,
  initialPlacement: "center" | "left",
  initialLeft: number,
  initialTop: number
): DragPosition {
  if (initialPlacement === "center") {
    return centerInViewport(panel, margin);
  }

  const rect = panel.getBoundingClientRect();
  return clampToViewport(
    rect.width,
    rect.height,
    {
      left: initialLeft,
      top: initialTop
    },
    margin
  );
}

export function useDraggableModalPosition({
  open,
  margin = 16,
  initialPlacement = "center",
  initialOffset,
  panelId,
  savePositionOnClose = true
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
  const localSavedPositionRef = useRef<DragPosition | null>(null);
  const [position, setPosition] = useState<DragPosition | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const initialLeft = initialOffset?.left ?? margin;
  const initialTop = initialOffset?.top ?? margin;

  const cleanupDragState = () => {
    if (dragCleanupRef.current) {
      dragCleanupRef.current();
      dragCleanupRef.current = null;
    }
    dragStateRef.current = null;
    setIsDragging(false);
  };

  useLayoutEffect(() => {
    if (!open) {
      cleanupDragState();
      setPosition(null);
      return;
    }

    const panel = panelRef.current;
    if (!panel) {
      return;
    }

    if (savePositionOnClose) {
      const savedPos = (panelId ? getSavedPanelPosition(panelId) : null) ?? localSavedPositionRef.current;
      if (savedPos) {
        const rect = panel.getBoundingClientRect();
        setPosition(clampToViewport(rect.width, rect.height, savedPos, margin));
        return;
      }
    }

    setPosition(placeInViewport(panel, margin, initialPlacement, initialLeft, initialTop));
  }, [initialLeft, initialPlacement, initialTop, margin, open, panelId, savePositionOnClose]);

  useEffect(() => {
    return () => {
      cleanupDragState();
    };
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.body.classList.add("modal-dragging");
    } else {
      document.body.classList.remove("modal-dragging");
    }

    return () => {
      document.body.classList.remove("modal-dragging");
    };
  }, [isDragging]);

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
          return placeInViewport(panel, margin, initialPlacement, initialLeft, initialTop);
        }
        const rect = panel.getBoundingClientRect();
        return clampToViewport(rect.width, rect.height, current, margin);
      });
    };

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [initialLeft, initialPlacement, initialTop, margin, open]);

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
      const panelRect = panelElement.getBoundingClientRect();
      const next = clampToViewport(
        panelRect.width,
        panelRect.height,
        {
          left: moveEvent.clientX - dragState.offsetX,
          top: moveEvent.clientY - dragState.offsetY
        },
        margin
      );
      setPosition(next);
      if (savePositionOnClose) {
        localSavedPositionRef.current = next;
        if (panelId) {
          savePanelPosition(panelId, next);
        }
      }
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

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // noop: pointer capture can fail on unsupported targets
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
    const vars: CSSProperties & {
      "--modal-x": string;
      "--modal-y": string;
    } = {
      "--modal-x": `${position.left}px`,
      "--modal-y": `${position.top}px`
    };

    return {
      ...vars,
      position: "fixed",
      left: 0,
      top: 0,
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

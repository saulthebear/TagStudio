import { useCallback, useEffect, useRef, useState } from "react";

export type UndoState = {
  token: number;
  message: string;
  pending: boolean;
  undo: () => Promise<void>;
};

type UseUndoStateArgs = {
  onUndoApplied: () => Promise<void>;
  onError: (message: string) => void;
  onClearError: () => void;
  timeoutMs?: number;
};

type UseUndoStateResult = {
  undoState: UndoState | null;
  clearUndo: () => void;
  queueUndo: (message: string, undo: () => Promise<void>) => void;
  runUndo: () => void;
};

export function useUndoState({
  onUndoApplied,
  onError,
  onClearError,
  timeoutMs = 6000
}: UseUndoStateArgs): UseUndoStateResult {
  const [undoState, setUndoState] = useState<UndoState | null>(null);
  const undoTokenRef = useRef(0);
  const undoTimeoutRef = useRef<number | null>(null);

  const clearUndo = useCallback(() => {
    if (undoTimeoutRef.current !== null) {
      window.clearTimeout(undoTimeoutRef.current);
      undoTimeoutRef.current = null;
    }
    setUndoState(null);
  }, []);

  const queueUndo = useCallback(
    (message: string, undo: () => Promise<void>) => {
      clearUndo();
      const token = undoTokenRef.current + 1;
      undoTokenRef.current = token;
      setUndoState({
        token,
        message,
        pending: false,
        undo
      });

      undoTimeoutRef.current = window.setTimeout(() => {
        setUndoState((prev) => (prev?.token === token ? null : prev));
      }, timeoutMs);
    },
    [clearUndo, timeoutMs]
  );

  const runUndo = useCallback(() => {
    if (!undoState || undoState.pending) {
      return;
    }

    const undoToken = undoState.token;
    const undoAction = undoState.undo;
    setUndoState((prev) => {
      if (!prev || prev.token !== undoToken) {
        return prev;
      }
      return {
        ...prev,
        pending: true
      };
    });

    void undoAction()
      .then(async () => {
        await onUndoApplied();
        onClearError();
      })
      .catch((error) => {
        onError(error instanceof Error ? error.message : "Undo failed.");
      })
      .finally(() => {
        if (undoTokenRef.current === undoToken) {
          clearUndo();
        }
      });
  }, [clearUndo, onClearError, onError, onUndoApplied, undoState]);

  useEffect(
    () => () => {
      if (undoTimeoutRef.current !== null) {
        window.clearTimeout(undoTimeoutRef.current);
      }
    },
    []
  );

  return {
    undoState,
    clearUndo,
    queueUndo,
    runUndo
  };
}

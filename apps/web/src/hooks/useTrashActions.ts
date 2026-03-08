import { type TrashEntriesResponse, type TrashFailureReasonCode } from "@tagstudio/api-client";
import { type Dispatch, type SetStateAction, useCallback, useEffect, useRef, useState } from "react";

export type TrashDialogState = {
  targetEntryIds: number[];
  skipForSession: boolean;
  rememberForLibrary: boolean;
};

type UseTrashActionsArgs = {
  confirmBeforeTrash: boolean;
  setConfirmBeforeTrashPreference: (enabled: boolean) => Promise<void>;
  trashEntries: (entryIds: number[]) => Promise<TrashEntriesResponse>;
  selectedEntryId: number | null;
  clearSelection: () => void;
  formatTrashFailureReason: (reasonCode: TrashFailureReasonCode) => string;
  onDeletedEntries: (deletedIds: Set<number>) => void;
  onError: (message: string) => void;
  onClearError: () => void;
  failureTimeoutMs?: number;
};

type UseTrashActionsResult = {
  skipTrashConfirmSession: boolean;
  setSkipTrashConfirmSession: (value: boolean) => void;
  trashDialogState: TrashDialogState | null;
  setTrashDialogState: Dispatch<SetStateAction<TrashDialogState | null>>;
  trashFailureMessagesByEntryId: ReadonlyMap<number, string>;
  inactiveEntryIds: ReadonlySet<number>;
  setInactiveEntryIds: Dispatch<SetStateAction<Set<number>>>;
  clearTrashFailureHighlights: () => void;
  resetTrashState: () => void;
  trimInactiveByVisibleIds: (visibleEntryIds: ReadonlySet<number>) => void;
  performTrash: (
    targetEntryIds: number[],
    options: {
      skipForSession: boolean;
      rememberForLibrary: boolean;
    }
  ) => Promise<void>;
};

export function useTrashActions({
  confirmBeforeTrash,
  setConfirmBeforeTrashPreference,
  trashEntries,
  selectedEntryId,
  clearSelection,
  formatTrashFailureReason,
  onDeletedEntries,
  onError,
  onClearError,
  failureTimeoutMs = 9000
}: UseTrashActionsArgs): UseTrashActionsResult {
  const [skipTrashConfirmSession, setSkipTrashConfirmSessionState] = useState(false);
  const [trashDialogState, setTrashDialogStateState] = useState<TrashDialogState | null>(null);
  const [trashFailureMessagesByEntryId, setTrashFailureMessagesByEntryId] = useState<Map<number, string>>(
    () => new Map()
  );
  const [inactiveEntryIds, setInactiveEntryIds] = useState<Set<number>>(() => new Set());
  const trashFailureTimeoutRef = useRef<number | null>(null);

  const clearTrashFailureHighlights = useCallback(() => {
    if (trashFailureTimeoutRef.current !== null) {
      window.clearTimeout(trashFailureTimeoutRef.current);
      trashFailureTimeoutRef.current = null;
    }
    setTrashFailureMessagesByEntryId(new Map());
  }, []);

  const setSkipTrashConfirmSession = useCallback((value: boolean) => {
    setSkipTrashConfirmSessionState(value);
  }, []);

  const resetTrashState = useCallback(() => {
    setSkipTrashConfirmSessionState(false);
    setTrashDialogStateState(null);
    setInactiveEntryIds(new Set());
    clearTrashFailureHighlights();
  }, [clearTrashFailureHighlights]);

  const trimInactiveByVisibleIds = useCallback((visibleEntryIds: ReadonlySet<number>) => {
    setInactiveEntryIds((prev) => {
      if (prev.size === 0) {
        return prev;
      }
      const next = new Set<number>();
      for (const entryId of prev) {
        if (visibleEntryIds.has(entryId)) {
          next.add(entryId);
        }
      }
      if (next.size === prev.size) {
        return prev;
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (confirmBeforeTrash) {
      setSkipTrashConfirmSessionState(false);
    }
  }, [confirmBeforeTrash]);

  useEffect(
    () => () => {
      if (trashFailureTimeoutRef.current !== null) {
        window.clearTimeout(trashFailureTimeoutRef.current);
      }
    },
    []
  );

  const performTrash = useCallback(
    async (
      targetEntryIds: number[],
      options: {
        skipForSession: boolean;
        rememberForLibrary: boolean;
      }
    ) => {
      if (targetEntryIds.length === 0) {
        return;
      }

      if (options.skipForSession) {
        setSkipTrashConfirmSessionState(true);
      }
      if (options.skipForSession && options.rememberForLibrary) {
        await setConfirmBeforeTrashPreference(false);
      }

      const response = await trashEntries(targetEntryIds);

      if (response.deleted_count > 0) {
        const deletedIds = new Set(response.deleted_entry_ids);
        setInactiveEntryIds((prev) => {
          const next = new Set(prev);
          for (const deletedId of deletedIds) {
            next.add(deletedId);
          }
          return next;
        });
        onDeletedEntries(deletedIds);
        if (selectedEntryId !== null && deletedIds.has(selectedEntryId)) {
          clearSelection();
        }
      }

      if (response.failed_count > 0) {
        const nextFailures = new Map<number, string>();
        for (const failure of response.failed_entries) {
          nextFailures.set(failure.entry_id, formatTrashFailureReason(failure.reason_code));
        }
        setTrashFailureMessagesByEntryId(nextFailures);
        if (trashFailureTimeoutRef.current !== null) {
          window.clearTimeout(trashFailureTimeoutRef.current);
        }
        trashFailureTimeoutRef.current = window.setTimeout(() => {
          setTrashFailureMessagesByEntryId(new Map());
        }, failureTimeoutMs);

        const noun = response.failed_count === 1 ? "entry" : "entries";
        onError(`Failed to move ${response.failed_count} ${noun} to Trash.`);
      } else {
        onClearError();
        clearTrashFailureHighlights();
      }
    },
    [
      clearSelection,
      clearTrashFailureHighlights,
      failureTimeoutMs,
      formatTrashFailureReason,
      onClearError,
      onDeletedEntries,
      onError,
      selectedEntryId,
      setConfirmBeforeTrashPreference,
      trashEntries
    ]
  );

  return {
    skipTrashConfirmSession,
    setSkipTrashConfirmSession,
    trashDialogState,
    setTrashDialogState: setTrashDialogStateState,
    trashFailureMessagesByEntryId,
    inactiveEntryIds,
    setInactiveEntryIds,
    clearTrashFailureHighlights,
    resetTrashState,
    trimInactiveByVisibleIds,
    performTrash
  };
}

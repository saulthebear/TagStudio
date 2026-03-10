import { type EntrySummaryResponse, type OpenEntriesResponse, type TrashEntriesResponse, type TrashFailureReasonCode } from "@tagstudio/api-client";
import { type Dispatch, type MouseEvent as ReactMouseEvent, type SetStateAction, useCallback, useEffect, useMemo, useState } from "react";

import { type ThumbnailContextMenuAction, type ThumbnailContextMenuState } from "@/components/ThumbnailGridPane";
import { useEntryContextActions } from "@/hooks/useEntryContextActions";
import { type TrashDialogState, useTrashActions } from "@/hooks/useTrashActions";
import { type UndoState, useUndoState } from "@/hooks/useUndoState";
import { TAG_ARCHIVED_ID, TAG_FAVORITE_ID } from "@/lib/reserved-tags";
import { computeDesktopSelection } from "@/lib/tag-workflows";

function getFileManagerRevealLabel(): string {
  if (typeof navigator === "undefined") {
    return "Show in File Manager";
  }

  const platform = `${navigator.platform ?? ""} ${navigator.userAgent ?? ""}`.toLowerCase();
  if (platform.includes("mac")) {
    return "Show in Finder";
  }
  if (platform.includes("win")) {
    return "Show in Explorer";
  }
  return "Show in File Manager";
}

type UseAppInteractionsArgs = {
  activeLibraryPath: string | null;
  entries: EntrySummaryResponse[];
  isMobile: boolean;
  selectedEntryId: number | null;
  selectEntry: (entryId: number) => void;
  clearSelection: () => void;
  reconcileSelectionWithEntries: (entries: EntrySummaryResponse[]) => void;
  setMobileActivePane: (pane: "grid" | "preview" | "metadata") => void;
  confirmBeforeTrash: boolean;
  setConfirmBeforeTrashPreference: (enabled: boolean) => Promise<void>;
  addTagToEntries: (entryIds: number[], tagId: number) => Promise<void>;
  removeTagFromEntries: (entryIds: number[], tagId: number) => Promise<void>;
  applyTagMutationToEntries: (entryIds: number[], tagId: number, mode: "add" | "remove") => void;
  refreshVisibleEntries: () => Promise<void>;
  trashEntries: (entryIds: number[]) => Promise<TrashEntriesResponse>;
  openEntries: (entryIds: number[]) => Promise<OpenEntriesResponse>;
  revealEntry: (entryId: number) => Promise<void>;
  formatTrashFailureReason: (reasonCode: TrashFailureReasonCode) => string;
  onError: (message: string) => void;
  onClearError: () => void;
  busyFlags: {
    tagMutationPending: boolean;
    trashPending: boolean;
    shellActionPending: boolean;
    refreshPending: boolean;
    searchPending: boolean;
  };
};

type UseAppInteractionsResult = {
  selectedEntryIds: number[];
  hasPasteableTags: boolean;
  trashDialogState: TrashDialogState | null;
  setTrashDialogState: Dispatch<SetStateAction<TrashDialogState | null>>;
  trashFailureMessagesByEntryId: ReadonlyMap<number, string>;
  inactiveEntryIds: ReadonlySet<number>;
  clearTrashFailureHighlights: () => void;
  isActionBusy: boolean;
  undoState: UndoState | null;
  runUndo: () => void;
  getContextMenuState: (entryId: number) => ThumbnailContextMenuState;
  handleContextMenuOpenTarget: (entryId: number, targetEntryIds: number[]) => void;
  handleContextMenuAction: (action: ThumbnailContextMenuAction, state: ThumbnailContextMenuState) => void;
  addTagsModalRequestNonce: number;
  confirmTrashDialog: () => void;
  pasteTagsFromMetadata: (targetEntryIds: number[]) => void;
  handleGridSelect: (entryId: number, event: ReactMouseEvent<HTMLButtonElement>) => void;
};

export function useAppInteractions({
  activeLibraryPath,
  entries,
  isMobile,
  selectedEntryId,
  selectEntry,
  clearSelection,
  reconcileSelectionWithEntries,
  setMobileActivePane,
  confirmBeforeTrash,
  setConfirmBeforeTrashPreference,
  addTagToEntries,
  removeTagFromEntries,
  applyTagMutationToEntries,
  refreshVisibleEntries,
  trashEntries,
  openEntries,
  revealEntry,
  formatTrashFailureReason,
  onError,
  onClearError,
  busyFlags
}: UseAppInteractionsArgs): UseAppInteractionsResult {
  const [selectedEntryIds, setSelectedEntryIds] = useState<number[]>([]);
  const [selectionAnchorId, setSelectionAnchorId] = useState<number | null>(null);
  const [contextActionPending, setContextActionPending] = useState(false);
  const [addTagsModalRequestNonce, setAddTagsModalRequestNonce] = useState(0);

  const { undoState, clearUndo, queueUndo, runUndo } = useUndoState({
    onUndoApplied: refreshVisibleEntries,
    onError,
    onClearError
  });

  const handleDeletedEntries = useCallback((deletedIds: Set<number>) => {
    setSelectedEntryIds((prev) => prev.filter((entryId) => !deletedIds.has(entryId)));
    setSelectionAnchorId((prev) => {
      if (prev === null || !deletedIds.has(prev)) {
        return prev;
      }
      return null;
    });
  }, []);

  const {
    skipTrashConfirmSession,
    trashDialogState,
    setTrashDialogState,
    trashFailureMessagesByEntryId,
    inactiveEntryIds,
    clearTrashFailureHighlights,
    resetTrashState,
    trimInactiveByVisibleIds,
    performTrash
  } = useTrashActions({
    confirmBeforeTrash,
    setConfirmBeforeTrashPreference,
    trashEntries,
    selectedEntryId,
    clearSelection,
    formatTrashFailureReason,
    onDeletedEntries: handleDeletedEntries,
    onError,
    onClearError
  });

  useEffect(() => {
    setSelectedEntryIds([]);
    setSelectionAnchorId(null);
    setContextActionPending(false);
    clearUndo();
    resetTrashState();
  }, [activeLibraryPath, clearUndo, resetTrashState]);

  useEffect(() => {
    reconcileSelectionWithEntries(entries);

    const visibleEntryIds = new Set(entries.map((entry) => entry.id));
    setSelectedEntryIds((prev) => prev.filter((entryId) => visibleEntryIds.has(entryId)));
    trimInactiveByVisibleIds(visibleEntryIds);
  }, [entries, reconcileSelectionWithEntries, trimInactiveByVisibleIds]);

  const entryById = useMemo(() => {
    return new Map(entries.map((entry) => [entry.id, entry]));
  }, [entries]);

  const revealLabel = useMemo(() => getFileManagerRevealLabel(), []);

  const isActionBusy =
    contextActionPending
    || busyFlags.tagMutationPending
    || busyFlags.trashPending
    || busyFlags.shellActionPending
    || busyFlags.refreshPending
    || busyFlags.searchPending;

  const runContextAsyncAction = useCallback(
    (action: () => Promise<void>) => {
      if (isActionBusy) {
        return;
      }
      setContextActionPending(true);
      void action()
        .catch((error) => {
          onError(error instanceof Error ? error.message : "Action failed.");
        })
        .finally(() => {
          setContextActionPending(false);
        });
    },
    [isActionBusy, onError]
  );

  const {
    hasPasteableTags,
    resetCopiedTagIds,
    getContextMenuState: getEntryContextMenuState,
    copyTagsFromEntries,
    pasteTagsToEntries,
    toggleReservedTagOnEntries,
    openFilesForEntries,
    revealFileInManager,
    copyFilepathsFromEntries
  } = useEntryContextActions({
    entryById,
    selectedEntryIds,
    inactiveEntryIds,
    revealLabel,
    addTagToEntries,
    removeTagFromEntries,
    applyTagMutationToEntries,
    queueUndo,
    refreshVisibleEntries,
    openEntries,
    revealEntry,
    activeLibraryPath,
    onError,
    onClearError
  });

  const getContextMenuState = useCallback(
    (entryId: number): ThumbnailContextMenuState => {
      return getEntryContextMenuState(entryId, isActionBusy);
    },
    [getEntryContextMenuState, isActionBusy]
  );

  useEffect(() => {
    resetCopiedTagIds();
  }, [activeLibraryPath, resetCopiedTagIds]);

  const handleContextMenuOpenTarget = useCallback(
    (entryId: number, targetEntryIds: number[]) => {
      if (targetEntryIds.length === 1 && targetEntryIds[0] === entryId && !selectedEntryIds.includes(entryId)) {
        setSelectedEntryIds([entryId]);
        setSelectionAnchorId(entryId);
        selectEntry(entryId);
      }
    },
    [selectEntry, selectedEntryIds]
  );

  const handleContextMenuAction = useCallback(
    (action: ThumbnailContextMenuAction, state: ThumbnailContextMenuState) => {
      if (state.targetEntryIds.length === 0) {
        return;
      }

      if (action === "open_file") {
        runContextAsyncAction(async () => {
          await openFilesForEntries(state.targetEntryIds);
        });
        return;
      }

      if (action === "reveal_file") {
        runContextAsyncAction(async () => {
          await revealFileInManager(state.contextEntryId);
        });
        return;
      }

      if (action === "copy_filepath") {
        runContextAsyncAction(async () => {
          await copyFilepathsFromEntries(state.targetEntryIds);
        });
        return;
      }

      if (action === "copy_tags") {
        copyTagsFromEntries(state.targetEntryIds);
        return;
      }

      if (action === "add_tags") {
        setSelectedEntryIds(state.targetEntryIds);
        const nextActiveId = state.targetEntryIds.includes(state.contextEntryId)
          ? state.contextEntryId
          : state.targetEntryIds[0];
        setSelectionAnchorId(nextActiveId);
        selectEntry(nextActiveId);
        setAddTagsModalRequestNonce((prev) => prev + 1);
        return;
      }

      if (action === "paste_tags") {
        runContextAsyncAction(async () => {
          await pasteTagsToEntries(state.targetEntryIds);
        });
        return;
      }

      if (action === "favorite_toggle") {
        runContextAsyncAction(async () => {
          const mode = state.favoriteMode === "favorite" ? "add" : "remove";
          await toggleReservedTagOnEntries(
            state.targetEntryIds,
            TAG_FAVORITE_ID,
            mode,
            mode === "add" ? "Favorited entries" : "Unfavorited entries"
          );
        });
        return;
      }

      if (action === "archive_toggle") {
        runContextAsyncAction(async () => {
          const mode = state.archiveMode === "archive" ? "add" : "remove";
          await toggleReservedTagOnEntries(
            state.targetEntryIds,
            TAG_ARCHIVED_ID,
            mode,
            mode === "add" ? "Archived entries" : "Unarchived entries"
          );
        });
        return;
      }

      if (action === "delete_to_trash") {
        if (!confirmBeforeTrash || skipTrashConfirmSession) {
          runContextAsyncAction(async () => {
            await performTrash(state.targetEntryIds, {
              skipForSession: false,
              rememberForLibrary: false
            });
          });
          return;
        }

        setTrashDialogState({
          targetEntryIds: state.targetEntryIds,
          skipForSession: false,
          rememberForLibrary: false
        });
      }
    },
    [
      confirmBeforeTrash,
      copyFilepathsFromEntries,
      copyTagsFromEntries,
      openFilesForEntries,
      pasteTagsToEntries,
      performTrash,
      revealFileInManager,
      runContextAsyncAction,
      selectEntry,
      setTrashDialogState,
      skipTrashConfirmSession,
      toggleReservedTagOnEntries
    ]
  );

  const confirmTrashDialog = useCallback(() => {
    if (!trashDialogState) {
      return;
    }

    const currentDialogState = trashDialogState;
    setTrashDialogState(null);
    runContextAsyncAction(async () => {
      await performTrash(currentDialogState.targetEntryIds, {
        skipForSession: currentDialogState.skipForSession,
        rememberForLibrary: currentDialogState.rememberForLibrary
      });
    });
  }, [performTrash, runContextAsyncAction, setTrashDialogState, trashDialogState]);

  const pasteTagsFromMetadata = useCallback(
    (targetEntryIds: number[]) => {
      const activeTargetIds = targetEntryIds.filter((entryId) => !inactiveEntryIds.has(entryId));
      if (activeTargetIds.length === 0) {
        return;
      }

      runContextAsyncAction(async () => {
        await pasteTagsToEntries(activeTargetIds);
      });
    },
    [inactiveEntryIds, pasteTagsToEntries, runContextAsyncAction]
  );

  const handleGridSelect = useCallback(
    (entryId: number, event: ReactMouseEvent<HTMLButtonElement>) => {
      clearTrashFailureHighlights();

      if (isMobile) {
        setSelectedEntryIds([entryId]);
        setSelectionAnchorId(entryId);
        selectEntry(entryId);
        setMobileActivePane("preview");
        return;
      }

      const nextSelection = computeDesktopSelection({
        clickedId: entryId,
        orderedIds: entries.map((entry) => entry.id),
        selectedIds: selectedEntryIds,
        activeId: selectedEntryId,
        anchorId: selectionAnchorId,
        ctrlOrMeta: event.metaKey || event.ctrlKey,
        shift: event.shiftKey
      });

      setSelectedEntryIds(nextSelection.selectedIds);
      setSelectionAnchorId(nextSelection.anchorId);
      if (nextSelection.activeId === null) {
        clearSelection();
      } else {
        selectEntry(nextSelection.activeId);
      }
    },
    [
      clearSelection,
      clearTrashFailureHighlights,
      entries,
      isMobile,
      selectEntry,
      selectedEntryId,
      selectedEntryIds,
      selectionAnchorId,
      setMobileActivePane
    ]
  );

  return {
    selectedEntryIds,
    hasPasteableTags,
    trashDialogState,
    setTrashDialogState,
    trashFailureMessagesByEntryId,
    inactiveEntryIds,
    clearTrashFailureHighlights,
    isActionBusy,
    undoState,
    runUndo,
    getContextMenuState,
    handleContextMenuOpenTarget,
    handleContextMenuAction,
    addTagsModalRequestNonce,
    confirmTrashDialog,
    pasteTagsFromMetadata,
    handleGridSelect
  };
}

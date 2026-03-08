import { type EntrySummaryResponse, type OpenEntriesResponse } from "@tagstudio/api-client";
import { useCallback, useMemo, useState } from "react";

import { type ThumbnailContextMenuState } from "@/components/ThumbnailGridPane";
import {
  collectTagUnionForEntries,
  getTagMutationTargets,
  getToggleModeForTag,
  resolveContextTargetEntryIds
} from "@/lib/context-actions";
import { TAG_ARCHIVED_ID, TAG_FAVORITE_ID } from "@/lib/reserved-tags";

const RESERVED_CONTEXT_TAG_IDS = new Set([TAG_ARCHIVED_ID, TAG_FAVORITE_ID]);
const MAX_OPEN_ENTRIES = 5;

function toAbsoluteFilePath(libraryPath: string, relativePath: string): string {
  const isWindows = /^[a-z]:[\\/]/i.test(libraryPath) || libraryPath.includes("\\");
  if (isWindows) {
    const root = libraryPath.replace(/[\\/]+$/, "");
    const rel = relativePath.replace(/^[/\\]+/, "").replace(/\//g, "\\");
    return `${root}\\${rel}`;
  }

  const root = libraryPath.replace(/\/+$/, "");
  const rel = relativePath.replace(/^\/+/, "");
  return `${root}/${rel}`;
}

type UseEntryContextActionsArgs = {
  entryById: ReadonlyMap<number, EntrySummaryResponse>;
  allTagIds: ReadonlySet<number>;
  selectedEntryIds: number[];
  inactiveEntryIds: ReadonlySet<number>;
  revealLabel: string;
  addTagToEntries: (entryIds: number[], tagId: number) => Promise<void>;
  removeTagFromEntries: (entryIds: number[], tagId: number) => Promise<void>;
  applyTagMutationToEntries: (entryIds: number[], tagId: number, mode: "add" | "remove") => void;
  queueUndo: (message: string, undo: () => Promise<void>) => void;
  refreshVisibleEntries: () => Promise<void>;
  openEntries: (entryIds: number[]) => Promise<OpenEntriesResponse>;
  revealEntry: (entryId: number) => Promise<void>;
  activeLibraryPath: string | null;
  onError: (message: string) => void;
  onClearError: () => void;
};

type UseEntryContextActionsResult = {
  copiedTagIds: number[];
  hasPasteableTags: boolean;
  resetCopiedTagIds: () => void;
  getContextMenuState: (entryId: number, isActionBusy: boolean) => ThumbnailContextMenuState;
  copyTagsFromEntries: (targetEntryIds: number[]) => void;
  pasteTagsToEntries: (targetEntryIds: number[]) => Promise<void>;
  toggleReservedTagOnEntries: (
    targetEntryIds: number[],
    tagId: number,
    mode: "add" | "remove",
    undoLabel: string
  ) => Promise<void>;
  openFilesForEntries: (targetEntryIds: number[]) => Promise<void>;
  revealFileInManager: (entryId: number) => Promise<void>;
  copyFilepathsFromEntries: (targetEntryIds: number[]) => Promise<void>;
};

export function useEntryContextActions({
  entryById,
  allTagIds,
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
}: UseEntryContextActionsArgs): UseEntryContextActionsResult {
  const [copiedTagIds, setCopiedTagIds] = useState<number[]>([]);

  const usableCopiedTagIds = useMemo(
    () =>
      copiedTagIds.filter(
        (tagId) => allTagIds.has(tagId) && !RESERVED_CONTEXT_TAG_IDS.has(tagId)
      ),
    [allTagIds, copiedTagIds]
  );

  const hasPasteableTags = usableCopiedTagIds.length > 0;

  const resetCopiedTagIds = useCallback(() => {
    setCopiedTagIds([]);
  }, []);

  const getContextMenuState = useCallback(
    (entryId: number, isActionBusy: boolean): ThumbnailContextMenuState => {
      const rawTargetIds = resolveContextTargetEntryIds(entryId, selectedEntryIds);
      const targetEntryIds = rawTargetIds.filter((id) => entryById.has(id) && !inactiveEntryIds.has(id));
      const effectiveTargetIds = targetEntryIds.length > 0 ? targetEntryIds : [entryId];
      const favoriteMode = getToggleModeForTag(entryById, effectiveTargetIds, TAG_FAVORITE_ID);
      const archiveMode = getToggleModeForTag(entryById, effectiveTargetIds, TAG_ARCHIVED_ID);

      return {
        contextEntryId: entryId,
        targetEntryIds: effectiveTargetIds,
        canPaste: hasPasteableTags,
        favoriteMode: favoriteMode === "add" ? "favorite" : "unfavorite",
        archiveMode: archiveMode === "add" ? "archive" : "unarchive",
        revealLabel,
        disabled: isActionBusy
      };
    },
    [entryById, hasPasteableTags, inactiveEntryIds, revealLabel, selectedEntryIds]
  );

  const copyTagsFromEntries = useCallback(
    (targetEntryIds: number[]) => {
      setCopiedTagIds(collectTagUnionForEntries(entryById, targetEntryIds, RESERVED_CONTEXT_TAG_IDS));
      onClearError();
    },
    [entryById, onClearError]
  );

  const pasteTagsToEntries = useCallback(
    async (targetEntryIds: number[]) => {
      if (usableCopiedTagIds.length === 0 || targetEntryIds.length === 0) {
        return;
      }

      const addedByTag: Array<{ tagId: number; entryIds: number[] }> = [];

      for (const tagId of usableCopiedTagIds) {
        const missingEntryIds = getTagMutationTargets(entryById, targetEntryIds, tagId, "add");
        if (missingEntryIds.length === 0) {
          continue;
        }
        await addTagToEntries(missingEntryIds, tagId);
        addedByTag.push({ tagId, entryIds: missingEntryIds });
      }

      if (addedByTag.length === 0) {
        return;
      }

      queueUndo("Pasted tags", async () => {
        for (const { tagId, entryIds } of addedByTag) {
          await removeTagFromEntries(entryIds, tagId);
        }
      });

      await refreshVisibleEntries();
    },
    [
      addTagToEntries,
      entryById,
      queueUndo,
      refreshVisibleEntries,
      removeTagFromEntries,
      usableCopiedTagIds
    ]
  );

  const toggleReservedTagOnEntries = useCallback(
    async (
      targetEntryIds: number[],
      tagId: number,
      mode: "add" | "remove",
      undoLabel: string
    ) => {
      if (targetEntryIds.length === 0) {
        return;
      }

      const mutationTargets = getTagMutationTargets(entryById, targetEntryIds, tagId, mode);
      if (mutationTargets.length === 0) {
        return;
      }

      if (mode === "add") {
        await addTagToEntries(mutationTargets, tagId);
      } else {
        await removeTagFromEntries(mutationTargets, tagId);
      }
      applyTagMutationToEntries(mutationTargets, tagId, mode);

      queueUndo(undoLabel, async () => {
        if (mode === "add") {
          await removeTagFromEntries(mutationTargets, tagId);
        } else {
          await addTagToEntries(mutationTargets, tagId);
        }
      });
    },
    [addTagToEntries, applyTagMutationToEntries, entryById, queueUndo, removeTagFromEntries]
  );

  const openFilesForEntries = useCallback(
    async (targetEntryIds: number[]) => {
      if (targetEntryIds.length === 0) {
        return;
      }

      const limitedEntryIds = targetEntryIds.slice(0, MAX_OPEN_ENTRIES);
      const response = await openEntries(limitedEntryIds);
      if (response.failed_count > 0) {
        const noun = response.failed_count === 1 ? "entry" : "entries";
        onError(`Failed to open ${response.failed_count} ${noun}.`);
        return;
      }

      if (targetEntryIds.length > limitedEntryIds.length) {
        onError(`Open is limited to ${MAX_OPEN_ENTRIES} entries at a time.`);
        return;
      }

      onClearError();
    },
    [onClearError, onError, openEntries]
  );

  const revealFileInManager = useCallback(
    async (entryId: number) => {
      await revealEntry(entryId);
      onClearError();
    },
    [onClearError, revealEntry]
  );

  const copyFilepathsFromEntries = useCallback(
    async (targetEntryIds: number[]) => {
      if (targetEntryIds.length === 0) {
        return;
      }

      const lines: string[] = [];
      for (const entryId of targetEntryIds) {
        const entry = entryById.get(entryId);
        if (!entry) {
          continue;
        }
        lines.push(activeLibraryPath ? toAbsoluteFilePath(activeLibraryPath, entry.path) : entry.path);
      }

      if (lines.length === 0) {
        return;
      }
      if (typeof navigator === "undefined") {
        throw new Error("Clipboard is not available in this environment.");
      }

      const clipboard = navigator.clipboard;
      if (!clipboard?.writeText) {
        throw new Error("Clipboard is not available in this browser.");
      }

      try {
        await clipboard.writeText(lines.join("\n"));
      } catch {
        throw new Error("Unable to copy file paths to clipboard.");
      }

      onClearError();
    },
    [activeLibraryPath, entryById, onClearError]
  );

  return {
    copiedTagIds,
    hasPasteableTags,
    resetCopiedTagIds,
    getContextMenuState,
    copyTagsFromEntries,
    pasteTagsToEntries,
    toggleReservedTagOnEntries,
    openFilesForEntries,
    revealFileInManager,
    copyFilepathsFromEntries
  };
}

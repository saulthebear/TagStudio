import type { TagResponse } from "@tagstudio/api-client";
import { useQuery } from "@tanstack/react-query";
import { type KeyboardEventHandler, useEffect, useMemo, useRef, useState } from "react";

import { api } from "@/api/client";
import { useDraggableModalPosition } from "@/hooks/useDraggableModalPosition";
import { useSearchInputFocus } from "@/hooks/useSearchInputFocus";
import {
  deriveTagApplicationState,
  isEditShortcutKey,
  moveHighlightIndex,
  normalizeTagQuery,
  scoreTags,
  shouldShowCreateAndAdd
} from "@/lib/tag-workflows";

export type AddTagsRow =
  | {
      kind: "tag";
      tag: TagResponse;
    }
  | {
      kind: "create";
      query: string;
    };

type UseAddTagsWorkflowParams = {
  open: boolean;
  selectedEntryIds: number[];
  entryTagIdsByEntry: Map<number, Set<number>>;
  onClose: () => void;
  onAddTagToEntries: (entryIds: number[], tagId: number) => Promise<void>;
  onAfterTagChanged: () => Promise<void>;
};

type DefaultHighlightIndexArgs = {
  rows: AddTagsRow[];
  selectedCount: number;
  membershipByTagId: Map<number, Set<number>>;
  pendingTagId: number | null;
};

function defaultHighlightIndex({
  rows,
  selectedCount,
  membershipByTagId,
  pendingTagId
}: DefaultHighlightIndexArgs): number {
  const firstActionableTagIndex = rows.findIndex((row) => {
    if (row.kind !== "tag") {
      return false;
    }
    if (pendingTagId === row.tag.id) {
      return false;
    }
    const membership = membershipByTagId.get(row.tag.id)?.size ?? 0;
    return deriveTagApplicationState(selectedCount, membership) !== "all";
  });

  if (rows[0]?.kind === "create") {
    return firstActionableTagIndex >= 0 ? firstActionableTagIndex : 0;
  }

  if (firstActionableTagIndex >= 0) {
    return firstActionableTagIndex;
  }

  return 0;
}

export function useAddTagsWorkflow({
  open,
  selectedEntryIds,
  entryTagIdsByEntry,
  onClose,
  onAddTagToEntries,
  onAfterTagChanged
}: UseAddTagsWorkflowParams) {
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [autoHighlightTagMatch, setAutoHighlightTagMatch] = useState(true);
  const [pendingTagId, setPendingTagId] = useState<number | null>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<"create" | "edit">("create");
  const [editorTag, setEditorTag] = useState<TagResponse | null>(null);
  const [editorInitialName, setEditorInitialName] = useState("");
  const [createAndAttach, setCreateAndAttach] = useState(false);
  const { inputRef: searchInputRef, focusInput: focusSearchInput } = useSearchInputFocus();
  const isMountedRef = useRef(true);

  const clearSearchState = () => {
    setQuery("");
    setHighlightedIndex(0);
    setAutoHighlightTagMatch(true);
  };

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const { panelRef, panelStyle, dragHandleProps, isDragging } = useDraggableModalPosition({
    open,
    initialPlacement: "left",
    initialOffset: { left: 20, top: 20 }
  });

  useEffect(() => {
    if (!open || editorOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, editorOpen, onClose]);

  const tagsQuery = useQuery({
    queryKey: ["add-tags", query],
    queryFn: () => api.getTags(query, -1),
    enabled: open
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    clearSearchState();
    setPendingTagId(null);
    setEditorOpen(false);
    setEditorTag(null);
    setEditorInitialName("");
    setCreateAndAttach(false);
    focusSearchInput();
  }, [focusSearchInput, open]);

  const membershipByTagId = useMemo(() => {
    const map = new Map<number, Set<number>>();
    for (const entryId of selectedEntryIds) {
      const tagIds = entryTagIdsByEntry.get(entryId) ?? new Set<number>();
      for (const tagId of tagIds) {
        const entrySet = map.get(tagId) ?? new Set<number>();
        entrySet.add(entryId);
        map.set(tagId, entrySet);
      }
    }
    return map;
  }, [entryTagIdsByEntry, selectedEntryIds]);

  const orderedTags = useMemo(() => scoreTags(tagsQuery.data ?? [], query), [query, tagsQuery.data]);
  const hasExactMatch = useMemo(() => !shouldShowCreateAndAdd(query, orderedTags), [orderedTags, query]);

  const rows = useMemo<AddTagsRow[]>(() => {
    const nextRows: AddTagsRow[] = orderedTags.map((tag) => ({ kind: "tag", tag }));
    const normalized = normalizeTagQuery(query);
    if (normalized && !hasExactMatch) {
      nextRows.unshift({ kind: "create", query: query.trim() });
    }
    return nextRows;
  }, [hasExactMatch, orderedTags, query]);

  const preferredHighlightIndex = useMemo(
    () =>
      defaultHighlightIndex({
        rows,
        selectedCount: selectedEntryIds.length,
        membershipByTagId,
        pendingTagId
      }),
    [membershipByTagId, pendingTagId, rows, selectedEntryIds.length]
  );

  useEffect(() => {
    if (rows.length === 0) {
      if (highlightedIndex !== 0) {
        setHighlightedIndex(0);
      }
      return;
    }

    if (highlightedIndex >= rows.length) {
      setHighlightedIndex(preferredHighlightIndex);
      return;
    }

    if (autoHighlightTagMatch && highlightedIndex === 0 && preferredHighlightIndex > 0) {
      setHighlightedIndex(preferredHighlightIndex);
      setAutoHighlightTagMatch(false);
    }
  }, [autoHighlightTagMatch, highlightedIndex, preferredHighlightIndex, rows.length]);

  const openCreateEditor = (name: string) => {
    setEditorMode("create");
    setEditorTag(null);
    setEditorInitialName(name);
    setCreateAndAttach(true);
    setEditorOpen(true);
  };

  const openEditEditor = (tag: TagResponse) => {
    setEditorMode("edit");
    setEditorTag(tag);
    setEditorInitialName("");
    setCreateAndAttach(false);
    setEditorOpen(true);
  };

  const addTag = async (tagId: number) => {
    const alreadyApplied = membershipByTagId.get(tagId) ?? new Set<number>();
    const targetEntryIds = selectedEntryIds.filter((entryId) => !alreadyApplied.has(entryId));
    if (targetEntryIds.length === 0) {
      return;
    }

    if (isMountedRef.current) {
      setPendingTagId(tagId);
      clearSearchState();
      focusSearchInput();
    }
    let addSucceeded = false;
    try {
      await onAddTagToEntries(targetEntryIds, tagId);
      addSucceeded = true;
      await onAfterTagChanged();
      await tagsQuery.refetch();
    } catch (error) {
      console.error("Failed to finish add tag workflow", error);
    } finally {
      if (isMountedRef.current) {
        if (!addSucceeded) {
          setAutoHighlightTagMatch(true);
        }
        setPendingTagId(null);
      }
    }
  };

  const onRowAction = async (row: AddTagsRow) => {
    if (row.kind === "create") {
      openCreateEditor(row.query);
      return;
    }
    await addTag(row.tag.id);
  };

  const onQueryKeyDown: KeyboardEventHandler<HTMLInputElement> = async (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setAutoHighlightTagMatch(false);
      setHighlightedIndex((prev) => moveHighlightIndex(prev, rows.length, "down"));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setAutoHighlightTagMatch(false);
      setHighlightedIndex((prev) => moveHighlightIndex(prev, rows.length, "up"));
      return;
    }

    if (isEditShortcutKey(event)) {
      event.preventDefault();
      const highlightedRow = rows[highlightedIndex] ?? rows[0];
      if (highlightedRow?.kind === "tag") {
        openEditEditor(highlightedRow.tag);
      }
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      if (rows.length > 0) {
        await onRowAction(rows[highlightedIndex] ?? rows[0]);
      } else if (normalizeTagQuery(query)) {
        openCreateEditor(query.trim());
      }
    }
  };

  const onQueryChange = (nextValue: string) => {
    setQuery(nextValue);
    setHighlightedIndex(0);
    setAutoHighlightTagMatch(true);
  };

  const onTagSaved = (savedTag: TagResponse) => {
    const afterSave = async () => {
      if (createAndAttach && editorMode === "create") {
        const existing = membershipByTagId.get(savedTag.id) ?? new Set<number>();
        const targetEntryIds = selectedEntryIds.filter((entryId) => !existing.has(entryId));
        if (targetEntryIds.length > 0) {
          await onAddTagToEntries(targetEntryIds, savedTag.id);
        }
      }
      await onAfterTagChanged();
      await tagsQuery.refetch();
      if (isMountedRef.current) {
        clearSearchState();
        focusSearchInput();
      }
    };

    void afterSave().catch((error) => {
      console.error("Failed to finish tag save workflow", error);
    });
  };

  return {
    panelRef,
    panelStyle,
    dragHandleProps,
    isDragging,
    searchInputRef,
    query,
    highlightedIndex,
    pendingTagId,
    editorOpen,
    editorMode,
    editorTag,
    editorInitialName,
    rows,
    selectedCount: selectedEntryIds.length,
    membershipByTagId,
    onQueryChange,
    onQueryKeyDown,
    openCreateEditor,
    closeEditor: () => setEditorOpen(false),
    addTag,
    onTagSaved
  };
}

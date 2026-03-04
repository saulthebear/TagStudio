import type { TagResponse } from "@tagstudio/api-client";
import { useQuery } from "@tanstack/react-query";
import { type KeyboardEventHandler, useEffect, useMemo, useState } from "react";

import { api } from "@/api/client";
import { useDraggableModalPosition } from "@/hooks/useDraggableModalPosition";
import { isEditShortcutKey, moveHighlightIndex, normalizeTagQuery, shouldShowCreateAndAdd } from "@/lib/tag-workflows";

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

function toSortedTags(tags: TagResponse[], query: string): TagResponse[] {
  const sorted = [...tags].sort((a, b) => a.name.localeCompare(b.name));
  const normalizedQuery = normalizeTagQuery(query);
  if (!normalizedQuery) {
    return sorted;
  }

  const priority = sorted
    .filter((tag) => tag.name.toLowerCase().startsWith(normalizedQuery))
    .sort((a, b) => a.name.length - b.name.length || a.name.localeCompare(b.name));

  const rest = sorted.filter((tag) => !priority.some((priorityTag) => priorityTag.id === tag.id));
  return [...priority, ...rest];
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
  const [limit, setLimit] = useState(25);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [pendingTagId, setPendingTagId] = useState<number | null>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<"create" | "edit">("create");
  const [editorTag, setEditorTag] = useState<TagResponse | null>(null);
  const [editorInitialName, setEditorInitialName] = useState("");
  const [createAndAttach, setCreateAndAttach] = useState(false);

  const { panelRef, panelStyle, dragHandleProps, isDragging } = useDraggableModalPosition({ open });

  useEffect(() => {
    if (!open || editorOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, editorOpen, onClose]);

  const tagsQuery = useQuery({
    queryKey: ["add-tags", query, limit],
    queryFn: () => api.getTags(query, limit),
    enabled: open
  });

  useEffect(() => {
    if (!open) {
      return;
    }
    setQuery("");
    setLimit(25);
    setHighlightedIndex(0);
    setPendingTagId(null);
    setEditorOpen(false);
    setEditorTag(null);
    setEditorInitialName("");
    setCreateAndAttach(false);
  }, [open]);

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

  const orderedTags = useMemo(() => toSortedTags(tagsQuery.data ?? [], query), [query, tagsQuery.data]);
  const hasExactMatch = useMemo(() => !shouldShowCreateAndAdd(query, orderedTags), [orderedTags, query]);

  const rows = useMemo<AddTagsRow[]>(() => {
    const nextRows: AddTagsRow[] = orderedTags.map((tag) => ({ kind: "tag", tag }));
    const normalized = normalizeTagQuery(query);
    if (normalized && !hasExactMatch) {
      nextRows.unshift({ kind: "create", query: query.trim() });
    }
    return nextRows;
  }, [hasExactMatch, orderedTags, query]);

  useEffect(() => {
    if (highlightedIndex >= rows.length) {
      setHighlightedIndex(0);
    }
  }, [highlightedIndex, rows.length]);

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

    setPendingTagId(tagId);
    try {
      await onAddTagToEntries(targetEntryIds, tagId);
      await onAfterTagChanged();
    } finally {
      setPendingTagId(null);
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
      setHighlightedIndex((prev) => moveHighlightIndex(prev, rows.length, "down"));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
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
    };
    void afterSave();
  };

  return {
    panelRef,
    panelStyle,
    dragHandleProps,
    isDragging,
    query,
    limit,
    highlightedIndex,
    pendingTagId,
    editorOpen,
    editorMode,
    editorTag,
    editorInitialName,
    rows,
    selectedCount: selectedEntryIds.length,
    membershipByTagId,
    setLimit,
    onQueryChange,
    onQueryKeyDown,
    openCreateEditor,
    closeEditor: () => setEditorOpen(false),
    addTag,
    onTagSaved
  };
}

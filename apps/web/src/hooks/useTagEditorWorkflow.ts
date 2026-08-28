import {
  type TagColorNamespaceResponse,
  type TagCreatePayload,
  type TagResponse,
  type TagType,
  type TagUpdatePayload
} from "@tagstudio/api-client";
import { useQuery } from "@tanstack/react-query";
import { type KeyboardEventHandler, useEffect, useMemo, useState } from "react";

import { api } from "@/api/client";
import { useDraggableModalPosition } from "@/hooks/useDraggableModalPosition";
import { useSearchInputFocus } from "@/hooks/useSearchInputFocus";
import { useTagColors } from "@/hooks/useTagColors";
import { createTagColorLookup } from "@/lib/tag-styles";
import {
  createTagDisplayContext,
  filterColorGroupsToParentColors,
  getParentTagColors,
  moveHighlightIndex,
  normalizeTagQuery,
  scoreTags,
  shouldShowCreateAndAdd
} from "@/lib/tag-workflows";

export type ParentCandidateRow =
  | {
      kind: "tag";
      tag: TagResponse;
    }
  | {
      kind: "create";
      query: string;
    };

type UseTagEditorWorkflowParams = {
  open: boolean;
  mode: "create" | "edit";
  tag: TagResponse | null;
  initialName?: string;
  onClose: () => void;
  onCreate: (payload: TagCreatePayload) => Promise<TagResponse | null>;
  onUpdate: (tagId: number, payload: TagUpdatePayload) => Promise<TagResponse | null>;
  onSaved?: (tag: TagResponse) => void;
};

function toUniqueAliases(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function findColorName(
  groups: TagColorNamespaceResponse[] | undefined,
  namespace: string | null,
  slug: string | null
): string {
  if (!namespace || !slug || !groups) {
    return "No Color";
  }

  for (const group of groups) {
    if (group.namespace !== namespace) {
      continue;
    }

    for (const color of group.colors) {
      if (color.slug === slug) {
        return `${group.namespace_name}: ${color.name}`;
      }
    }
  }

  return "No Color";
}

export function useTagEditorWorkflow({
  open,
  mode,
  tag,
  initialName,
  onClose,
  onCreate,
  onUpdate,
  onSaved
}: UseTagEditorWorkflowParams) {
  const [name, setName] = useState("");
  const [shorthand, setShorthand] = useState("");
  const [aliases, setAliases] = useState<string[]>([]);
  const [parentIds, setParentIds] = useState<number[]>([]);
  const [disambiguationId, setDisambiguationId] = useState<number | null>(null);
  const [colorNamespace, setColorNamespace] = useState<string | null>(null);
  const [colorSlug, setColorSlug] = useState<string | null>(null);
  const [isCategory, setIsCategory] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  const [tagType, setTagType] = useState<TagType>("content");

  const [parentPickerOpen, setParentPickerOpen] = useState(false);
  const [parentQuery, setParentQuery] = useState("");
  const [highlightedParentIndex, setHighlightedParentIndex] = useState(0);
  const [autoHighlightParentMatch, setAutoHighlightParentMatch] = useState(true);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [colorPickerMode, setColorPickerMode] = useState<"all" | "parent">("all");
  const [savePending, setSavePending] = useState(false);
  const { inputRef: parentSearchInputRef, focusInput: focusParentSearchInput } = useSearchInputFocus();

  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (colorPickerOpen) {
        setColorPickerOpen(false);
      } else if (parentPickerOpen) {
        setParentPickerOpen(false);
      } else {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open, colorPickerOpen, parentPickerOpen, onClose]);

  const tagEditorDrag = useDraggableModalPosition({
    open,
    initialPlacement: "left",
    initialOffset: { left: 20, top: 20 },
    panelId: "tag-editor-modal"
  });
  const parentPickerDrag = useDraggableModalPosition({
    open: open && parentPickerOpen,
    initialPlacement: "left",
    initialOffset: { left: 32, top: 32 },
    panelId: "parent-picker-modal"
  });
  const colorPickerDrag = useDraggableModalPosition({
    open: open && colorPickerOpen,
    initialPlacement: "left",
    initialOffset: { left: 44, top: 44 },
    panelId: "color-picker-modal"
  });

  const allTagsQuery = useQuery({
    queryKey: ["tag-editor-all-tags"],
    queryFn: () => api.getTags(undefined, -1),
    enabled: open
  });

  const parentCandidatesQuery = useQuery({
    queryKey: ["tag-editor-parent-candidates", tag?.id ?? "new", parentQuery],
    queryFn: () => api.getTags(parentQuery, -1, tag?.id),
    enabled: open && parentPickerOpen
  });

  const tagColorsQuery = useTagColors(open);

  useEffect(() => {
    if (!open) {
      return;
    }

    setName(mode === "create" ? (initialName ?? "") : (tag?.name ?? ""));
    setShorthand(mode === "create" ? "" : (tag?.shorthand ?? ""));
    setAliases(mode === "create" ? [] : [...(tag?.aliases ?? [])]);
    setParentIds(mode === "create" ? [] : [...(tag?.parent_ids ?? [])]);
    setDisambiguationId(mode === "create" ? null : (tag?.disambiguation_id ?? null));
    setColorNamespace(mode === "create" ? null : (tag?.color_namespace ?? null));
    setColorSlug(mode === "create" ? null : (tag?.color_slug ?? null));
    setIsCategory(mode === "create" ? false : (tag?.is_category ?? false));
    setIsHidden(mode === "create" ? false : (tag?.is_hidden ?? false));
    setTagType(mode === "create" ? "content" : (tag?.tag_type ?? "content"));
    setParentPickerOpen(false);
    setParentQuery("");
    setHighlightedParentIndex(0);
    setAutoHighlightParentMatch(true);
    setColorPickerOpen(false);
    setColorPickerMode("all");
    setSavePending(false);
  }, [initialName, mode, open, tag]);

  useEffect(() => {
    if (!open || !parentPickerOpen) {
      return;
    }

    setHighlightedParentIndex(0);
    setAutoHighlightParentMatch(true);
    focusParentSearchInput();
  }, [focusParentSearchInput, open, parentPickerOpen]);

  const tagById = useMemo(() => {
    const map = new Map<number, TagResponse>();
    for (const item of allTagsQuery.data ?? []) {
      map.set(item.id, item);
    }
    return map;
  }, [allTagsQuery.data]);

  const selectedParents = useMemo(
    () =>
      parentIds
        .map((id) => tagById.get(id))
        .filter((value): value is TagResponse => value !== undefined)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [parentIds, tagById]
  );

  const parentColors = useMemo(() => getParentTagColors(selectedParents), [selectedParents]);
  const canCopyParentColor = parentColors.length > 0;

  const parentCandidates = useMemo(
    () => scoreTags(parentCandidatesQuery.data ?? [], parentQuery),
    [parentCandidatesQuery.data, parentQuery]
  );

  const hasExactParentMatch = useMemo(
    () => !shouldShowCreateAndAdd(parentQuery, parentCandidates),
    [parentCandidates, parentQuery]
  );

  const parentRows = useMemo<ParentCandidateRow[]>(() => {
    const rows: ParentCandidateRow[] = parentCandidates.map((tag) => ({ kind: "tag", tag }));
    const normalized = normalizeTagQuery(parentQuery);
    if (normalized && !hasExactParentMatch) {
      rows.unshift({ kind: "create", query: parentQuery.trim() });
    }
    return rows;
  }, [hasExactParentMatch, parentCandidates, parentQuery]);

  const preferredHighlightParentIndex = useMemo(() => {
    const firstActionableIndex = parentRows.findIndex((row) => {
      if (row.kind === "create") {
        return true;
      }
      return !parentIds.includes(row.tag.id);
    });
    return firstActionableIndex >= 0 ? firstActionableIndex : 0;
  }, [parentIds, parentRows]);

  useEffect(() => {
    if (parentRows.length === 0) {
      if (highlightedParentIndex !== 0) {
        setHighlightedParentIndex(0);
      }
      return;
    }

    if (highlightedParentIndex >= parentRows.length) {
      setHighlightedParentIndex(preferredHighlightParentIndex);
      return;
    }

    if (autoHighlightParentMatch && highlightedParentIndex === 0 && preferredHighlightParentIndex > 0) {
      setHighlightedParentIndex(preferredHighlightParentIndex);
      setAutoHighlightParentMatch(false);
    }
  }, [autoHighlightParentMatch, highlightedParentIndex, parentRows.length, preferredHighlightParentIndex]);

  const tagDisplayContext = useMemo(() => {
    const tagByIdMap = new Map<number, TagResponse>();
    for (const item of allTagsQuery.data ?? []) {
      tagByIdMap.set(item.id, item);
    }
    for (const candidate of parentCandidates) {
      tagByIdMap.set(candidate.id, candidate);
    }
    return createTagDisplayContext([...tagByIdMap.values()]);
  }, [allTagsQuery.data, parentCandidates]);

  const tagColorLookup = useMemo(() => createTagColorLookup(tagColorsQuery.data), [tagColorsQuery.data]);

  const disambiguationLabel = useMemo(() => {
    if (!disambiguationId) {
      return "";
    }
    const parent = tagById.get(disambiguationId);
    const display = parent?.shorthand || parent?.name || `#${disambiguationId}`;
    return `${name.trim() || "Tag"} (${display})`;
  }, [disambiguationId, name, tagById]);

  const colorLabel = useMemo(
    () => findColorName(tagColorsQuery.data, colorNamespace, colorSlug),
    [colorNamespace, colorSlug, tagColorsQuery.data]
  );

  const normalizedName = name.trim();
  const canSave = normalizedName.length > 0 && !savePending;

  const removeParent = (parentId: number) => {
    setParentIds((prev) => prev.filter((id) => id !== parentId));
    setDisambiguationId((prev) => (prev === parentId ? null : prev));
  };

  const addAliasRow = () => {
    setAliases((prev) => [...prev, ""]);
  };

  const updateAlias = (index: number, nextValue: string) => {
    setAliases((prev) => prev.map((value, idx) => (idx === index ? nextValue : value)));
  };

  const removeAlias = (index: number) => {
    setAliases((prev) => prev.filter((_, idx) => idx !== index));
  };

  const addParent = (parentId: number) => {
    if (parentIds.includes(parentId)) {
      return;
    }
    setParentIds((prev) => [...prev, parentId]);
    setParentQuery("");
    setHighlightedParentIndex(0);
    setAutoHighlightParentMatch(true);
    focusParentSearchInput();
  };

  const createAndAddParent = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    const created = await onCreate({
      name: trimmed,
      aliases: [],
      parent_ids: [],
      color_namespace: null,
      color_slug: null,
      disambiguation_id: null,
      is_category: false,
      is_hidden: false
    });
    if (created) {
      addParent(created.id);
      void allTagsQuery.refetch();
      void parentCandidatesQuery.refetch();
    }
  };

  const onParentQueryChange = (nextValue: string) => {
    setParentQuery(nextValue);
    setHighlightedParentIndex(0);
    setAutoHighlightParentMatch(true);
  };

  const onParentQueryKeyDown: KeyboardEventHandler<HTMLInputElement> = (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setAutoHighlightParentMatch(false);
      setHighlightedParentIndex((prev) => moveHighlightIndex(prev, parentRows.length, "down"));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setAutoHighlightParentMatch(false);
      setHighlightedParentIndex((prev) => moveHighlightIndex(prev, parentRows.length, "up"));
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      if (parentRows.length > 0) {
        const targetRow = parentRows[highlightedParentIndex] ?? parentRows[0];
        if (targetRow) {
          if (targetRow.kind === "create") {
            void createAndAddParent(targetRow.query);
          } else if (!parentIds.includes(targetRow.tag.id)) {
            addParent(targetRow.tag.id);
          }
        }
      }
    }
  };

  const clearColor = () => {
    setColorNamespace(null);
    setColorSlug(null);
    setColorPickerOpen(false);
  };

  const setColor = (namespace: string, slug: string) => {
    setColorNamespace(namespace);
    setColorSlug(slug);
    setColorPickerOpen(false);
  };

  const openColorPicker = () => {
    setColorPickerMode("all");
    setColorPickerOpen(true);
  };

  const copyParentColor = () => {
    if (parentColors.length === 0) {
      return;
    }
    if (parentColors.length === 1) {
      setColor(parentColors[0].namespace, parentColors[0].slug);
      return;
    }
    setColorPickerMode("parent");
    setColorPickerOpen(true);
  };

  const colorGroups = useMemo(() => {
    if (colorPickerMode === "parent") {
      return filterColorGroupsToParentColors(tagColorsQuery.data, parentColors);
    }
    return tagColorsQuery.data ?? [];
  }, [colorPickerMode, parentColors, tagColorsQuery.data]);

  const saveTag = async () => {
    if (!canSave) {
      return;
    }

    const payload: TagCreatePayload = {
      name: normalizedName,
      shorthand: shorthand.trim() ? shorthand.trim() : null,
      aliases: toUniqueAliases(aliases),
      parent_ids: [...parentIds],
      disambiguation_id: disambiguationId,
      color_namespace: colorNamespace,
      color_slug: colorSlug,
      is_category: isCategory,
      is_hidden: isHidden,
      tag_type: tagType
    };

    setSavePending(true);
    try {
      const saved =
        mode === "create" || !tag
          ? await onCreate(payload)
          : await onUpdate(tag.id, {
              ...payload,
              aliases: payload.aliases,
              parent_ids: payload.parent_ids,
              is_category: payload.is_category,
              is_hidden: payload.is_hidden,
              tag_type: payload.tag_type
            });

      if (saved) {
        onSaved?.(saved);
        onClose();
      }
    } finally {
      setSavePending(false);
    }
  };

  return {
    name,
    shorthand,
    aliases,
    selectedParents,
    disambiguationId,
    disambiguationLabel,
    colorLabel,
    colorNamespace,
    colorSlug,
    isCategory,
    isHidden,
    tagType,
    parentIds,
    parentPickerOpen,
    parentQuery,
    parentSearchInputRef,
    highlightedParentIndex,
    tagDisplayContext,
    tagColorLookup,
    colorPickerOpen,
    colorPickerMode,
    parentColors,
    canCopyParentColor,
    savePending,
    canSave,
    parentCandidates,
    parentRows,
    colorGroups,
    tagEditorDrag,
    parentPickerDrag,
    colorPickerDrag,
    setName,
    setShorthand,
    setDisambiguationId,
    setIsCategory,
    setIsHidden,
    setTagType,
    setParentPickerOpen,
    setParentQuery,
    onParentQueryChange,
    onParentQueryKeyDown,
    setColorPickerOpen,
    openColorPicker,
    copyParentColor,
    addAliasRow,
    updateAlias,
    removeAlias,
    removeParent,
    addParent,
    createAndAddParent,
    clearColor,
    setColor,
    saveTag
  };
}

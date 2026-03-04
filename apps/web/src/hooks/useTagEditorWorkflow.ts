import {
  type TagColorNamespaceResponse,
  type TagCreatePayload,
  type TagResponse,
  type TagUpdatePayload
} from "@tagstudio/api-client";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { api } from "@/api/client";
import { useDraggableModalPosition } from "@/hooks/useDraggableModalPosition";

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

  const [parentPickerOpen, setParentPickerOpen] = useState(false);
  const [parentQuery, setParentQuery] = useState("");
  const [parentLimit, setParentLimit] = useState(25);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [savePending, setSavePending] = useState(false);

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

  const tagEditorDrag = useDraggableModalPosition({ open });
  const parentPickerDrag = useDraggableModalPosition({ open: open && parentPickerOpen });
  const colorPickerDrag = useDraggableModalPosition({ open: open && colorPickerOpen });

  const allTagsQuery = useQuery({
    queryKey: ["tag-editor-all-tags"],
    queryFn: () => api.getTags(undefined, -1),
    enabled: open
  });

  const parentCandidatesQuery = useQuery({
    queryKey: ["tag-editor-parent-candidates", tag?.id ?? "new", parentQuery, parentLimit],
    queryFn: () => api.getTags(parentQuery, parentLimit, tag?.id),
    enabled: open && parentPickerOpen
  });

  const tagColorsQuery = useQuery({
    queryKey: ["tag-colors"],
    queryFn: () => api.getTagColors(),
    enabled: open
  });

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
    setParentPickerOpen(false);
    setParentQuery("");
    setParentLimit(25);
    setColorPickerOpen(false);
    setSavePending(false);
  }, [initialName, mode, open, tag]);

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
    setParentIds((prev) => [...prev, parentId]);
    setParentPickerOpen(false);
    setParentQuery("");
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
      is_hidden: isHidden
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
              is_hidden: payload.is_hidden
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
    parentIds,
    parentPickerOpen,
    parentQuery,
    parentLimit,
    colorPickerOpen,
    savePending,
    canSave,
    parentCandidates: parentCandidatesQuery.data ?? [],
    colorGroups: tagColorsQuery.data ?? [],
    tagEditorDrag,
    parentPickerDrag,
    colorPickerDrag,
    setName,
    setShorthand,
    setDisambiguationId,
    setIsCategory,
    setIsHidden,
    setParentPickerOpen,
    setParentQuery,
    setParentLimit,
    setColorPickerOpen,
    addAliasRow,
    updateAlias,
    removeAlias,
    removeParent,
    addParent,
    clearColor,
    setColor,
    saveTag
  };
}

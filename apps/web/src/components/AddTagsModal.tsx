import { type TagCreatePayload, type TagResponse, type TagUpdatePayload } from "@tagstudio/api-client";
import { Button } from "@tagstudio/ui";
import { useQuery } from "@tanstack/react-query";
import { type KeyboardEventHandler, useEffect, useMemo, useState } from "react";
import { Virtuoso } from "react-virtuoso";

import { api } from "@/api/client";
import { TagEditorModal } from "@/components/TagEditorModal";
import {
  deriveTagApplicationState,
  moveHighlightIndex,
  normalizeTagQuery,
  shouldShowCreateAndAdd
} from "@/lib/tag-workflows";

type AddTagsModalProps = {
  open: boolean;
  selectedEntryIds: number[];
  entryTagIdsByEntry: Map<number, Set<number>>;
  onClose: () => void;
  onAddTagToEntries: (entryIds: number[], tagId: number) => Promise<void>;
  onCreateTag: (payload: TagCreatePayload) => Promise<TagResponse | null>;
  onUpdateTag: (tagId: number, payload: TagUpdatePayload) => Promise<TagResponse | null>;
  onAfterTagChanged: () => Promise<void>;
};

type AddTagsRow =
  | {
      kind: "tag";
      tag: TagResponse;
    }
  | {
      kind: "create";
      query: string;
    };

const LIMIT_OPTIONS: Array<{ label: string; value: number }> = [
  { label: "25", value: 25 },
  { label: "50", value: 50 },
  { label: "100", value: 100 },
  { label: "250", value: 250 },
  { label: "500", value: 500 },
  { label: "All", value: -1 }
];

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

export function AddTagsModal({
  open,
  selectedEntryIds,
  entryTagIdsByEntry,
  onClose,
  onAddTagToEntries,
  onCreateTag,
  onUpdateTag,
  onAfterTagChanged
}: AddTagsModalProps) {
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(25);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [pendingTagId, setPendingTagId] = useState<number | null>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<"create" | "edit">("create");
  const [editorTag, setEditorTag] = useState<TagResponse | null>(null);
  const [editorInitialName, setEditorInitialName] = useState("");
  const [createAndAttach, setCreateAndAttach] = useState(false);

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

  const selectedCount = selectedEntryIds.length;

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

  const hasExactMatch = useMemo(() => {
    return !shouldShowCreateAndAdd(query, orderedTags);
  }, [orderedTags, query]);

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

  if (!open) {
    return null;
  }

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

  const handleRowAction = async (row: AddTagsRow) => {
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

    if (event.key === "Enter") {
      event.preventDefault();
      if (rows.length > 0) {
        await handleRowAction(rows[highlightedIndex] ?? rows[0]);
      } else if (normalizeTagQuery(query)) {
        openCreateEditor(query.trim());
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <div className="overlay" role="presentation" onClick={onClose}>
      <div
        className="overlay-panel panel add-tags-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Add tags"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="panel-title m-0">Add Tags</h2>

        <div className="add-tags-controls">
          <label className="settings-row add-tags-limit-row">
            <span>View Limit:</span>
            <select
              className="input-base"
              value={String(limit)}
              onChange={(event) => setLimit(Number(event.target.value))}
            >
              {LIMIT_OPTIONS.map((option) => (
                <option key={option.label} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <input
            className="input-base"
            placeholder="Search tags"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setHighlightedIndex(0);
            }}
            onKeyDown={onQueryKeyDown}
            autoFocus
          />
        </div>

        <div className="add-tags-list-shell">
          <Virtuoso
            data={rows}
            style={{ height: 460 }}
            itemContent={(index, row) => {
              const highlighted = index === highlightedIndex;
              if (row.kind === "create") {
                return (
                  <button
                    type="button"
                    className={`add-tags-create-row ${highlighted ? "add-tags-row-highlighted" : ""}`}
                    onClick={() => openCreateEditor(row.query)}
                  >
                    Create &amp; Add &quot;{row.query}&quot;
                  </button>
                );
              }

              const membership = membershipByTagId.get(row.tag.id)?.size ?? 0;
              const state = deriveTagApplicationState(selectedCount, membership);
              const isPending = pendingTagId === row.tag.id;
              const addDisabled = state === "all" || isPending;

              return (
                <div className={`add-tags-row ${highlighted ? "add-tags-row-highlighted" : ""}`}>
                  <button
                    type="button"
                    className="add-tags-row-main"
                    disabled={addDisabled}
                    onClick={() => {
                      void addTag(row.tag.id);
                    }}
                  >
                    <span>{row.tag.name}</span>
                    <span className="add-tags-row-state">
                      {isPending
                        ? "Adding..."
                        : state === "all"
                          ? "Added"
                          : state === "partial"
                            ? "Partial"
                            : "Add"}
                    </span>
                  </button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => openEditEditor(row.tag)}
                    disabled={isPending}
                  >
                    Edit
                  </Button>
                </div>
              );
            }}
          />
        </div>

        <div className="overlay-panel-actions">
          <Button variant="secondary" onClick={onClose}>
            Done
          </Button>
        </div>

        <TagEditorModal
          open={editorOpen}
          mode={editorMode}
          tag={editorTag}
          initialName={editorInitialName}
          onClose={() => setEditorOpen(false)}
          onCreate={onCreateTag}
          onUpdate={onUpdateTag}
          onSaved={(savedTag) => {
            const afterSave = async () => {
              if (createAndAttach && editorMode === "create") {
                const existing = membershipByTagId.get(savedTag.id) ?? new Set<number>();
                const targetEntryIds = selectedEntryIds.filter((entryId) => !existing.has(entryId));
                if (targetEntryIds.length > 0) {
                  await onAddTagToEntries(targetEntryIds, savedTag.id);
                }
              }
              await onAfterTagChanged();
            };
            void afterSave();
          }}
        />
      </div>
    </div>
  );
}

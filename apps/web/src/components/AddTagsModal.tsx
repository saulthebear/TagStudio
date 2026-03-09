import { type TagCreatePayload, type TagResponse, type TagUpdatePayload } from "@tagstudio/api-client";
import { Button } from "@tagstudio/ui";
import { useMemo } from "react";
import { Virtuoso } from "react-virtuoso";

import { ModalLayerPortal } from "@/components/ModalLayerPortal";
import { TagEditorModal } from "@/components/TagEditorModal";
import { useAddTagsWorkflow } from "@/hooks/useAddTagsWorkflow";
import { useTagColors } from "@/hooks/useTagColors";
import { createTagColorLookup, resolveTagChipStyle } from "@/lib/tag-styles";
import { createTagDisplayContext, deriveTagApplicationState, getTagDisplayLabel } from "@/lib/tag-workflows";

type AddTagsModalProps = {
  open: boolean;
  allTags: TagResponse[];
  selectedEntryIds: number[];
  entryTagIdsByEntry: Map<number, Set<number>>;
  onClose: () => void;
  onAddTagToEntries: (entryIds: number[], tagId: number) => Promise<void>;
  onCreateTag: (payload: TagCreatePayload) => Promise<TagResponse | null>;
  onUpdateTag: (tagId: number, payload: TagUpdatePayload) => Promise<TagResponse | null>;
  onAfterTagChanged: () => Promise<void>;
};

const LIMIT_OPTIONS: Array<{ label: string; value: number }> = [
  { label: "25", value: 25 },
  { label: "50", value: 50 },
  { label: "100", value: 100 },
  { label: "250", value: 250 },
  { label: "500", value: 500 },
  { label: "All", value: -1 }
];

export function AddTagsModal({
  open,
  allTags,
  selectedEntryIds,
  entryTagIdsByEntry,
  onClose,
  onAddTagToEntries,
  onCreateTag,
  onUpdateTag,
  onAfterTagChanged
}: AddTagsModalProps) {
  const workflow = useAddTagsWorkflow({
    open,
    selectedEntryIds,
    entryTagIdsByEntry,
    onClose,
    onAddTagToEntries,
    onAfterTagChanged
  });
  const tagColorsQuery = useTagColors(open);
  const tagDisplayContext = useMemo(() => {
    const tagById = new Map<number, TagResponse>();
    for (const tag of allTags) {
      tagById.set(tag.id, tag);
    }

    for (const row of workflow.rows) {
      if (row.kind === "tag") {
        tagById.set(row.tag.id, row.tag);
      }
    }

    return createTagDisplayContext([...tagById.values()]);
  }, [allTags, workflow.rows]);
  const tagColorLookup = useMemo(() => createTagColorLookup(tagColorsQuery.data), [tagColorsQuery.data]);

  if (!open) {
    return null;
  }

  return (
    <ModalLayerPortal open={open} onBackdropClick={onClose}>
      <div
        ref={workflow.panelRef}
        className={`overlay-panel panel tag-workflow-panel add-tags-panel modal-draggable-panel ${workflow.isDragging ? "modal-panel-dragging" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Add tags"
        style={workflow.panelStyle}
      >
        <div className="modal-drag-handle" {...workflow.dragHandleProps}>
          <h2 className="panel-title m-0">Add Tags</h2>
        </div>

        <div className="add-tags-controls">
          <label className="settings-row add-tags-limit-row">
            <span>View Limit:</span>
            <select
              className="input-base"
              value={String(workflow.limit)}
              onChange={(event) => workflow.setLimit(Number(event.target.value))}
            >
              {LIMIT_OPTIONS.map((option) => (
                <option key={option.label} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <input
            ref={workflow.searchInputRef}
            className="input-base"
            placeholder="Search tags"
            value={workflow.query}
            onChange={(event) => workflow.onQueryChange(event.target.value)}
            onKeyDown={workflow.onQueryKeyDown}
            autoFocus
          />
        </div>

        <div className="add-tags-list-shell">
          <Virtuoso
            data={workflow.rows}
            style={{ height: 460 }}
            itemContent={(index, row) => {
              const highlighted = index === workflow.highlightedIndex;
              if (row.kind === "create") {
                return (
                  <button
                    type="button"
                    className={`add-tags-create-row ${highlighted ? "add-tags-row-highlighted" : ""}`}
                    onClick={() => workflow.openCreateEditor(row.query)}
                  >
                    Create &amp; Add &quot;{row.query}&quot;
                  </button>
                );
              }

              const membership = workflow.membershipByTagId.get(row.tag.id)?.size ?? 0;
              const state = deriveTagApplicationState(workflow.selectedCount, membership);
              const isPending = workflow.pendingTagId === row.tag.id;
              const addDisabled = state === "all" || isPending;
              const tagLabel = getTagDisplayLabel(row.tag, tagDisplayContext);
              const tagStyle = resolveTagChipStyle(row.tag, tagColorLookup);

              return (
                <div className={`add-tags-row ${highlighted ? "add-tags-row-highlighted" : ""}`}>
                  <button
                    type="button"
                    className="add-tags-row-main"
                    disabled={addDisabled}
                    onClick={() => {
                      void workflow.addTag(row.tag.id);
                    }}
                  >
                    <span className="add-tags-row-label-chip" style={tagStyle}>
                      {tagLabel}
                    </span>
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
          open={workflow.editorOpen}
          mode={workflow.editorMode}
          tag={workflow.editorTag}
          initialName={workflow.editorInitialName}
          onClose={workflow.closeEditor}
          onCreate={onCreateTag}
          onUpdate={onUpdateTag}
          onSaved={workflow.onTagSaved}
        />
      </div>
    </ModalLayerPortal>
  );
}

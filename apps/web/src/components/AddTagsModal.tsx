import { type TagCreatePayload, type TagResponse, type TagUpdatePayload } from "@tagstudio/api-client";
import { X } from "lucide-react";
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
    <ModalLayerPortal open={open} dimBackdrop={false} onBackdropClick={onClose}>
      <div
        ref={workflow.panelRef}
        className={`overlay-panel panel tag-workflow-panel add-tags-panel modal-draggable-panel ${workflow.isDragging ? "modal-panel-dragging" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Add tags"
        style={workflow.panelStyle}
      >
        <div className="add-tags-header">
          <div className="modal-drag-handle" {...workflow.dragHandleProps}>
            <h2 className="panel-title m-0">Add Tags</h2>
          </div>
          <button
            type="button"
            className="add-tags-close-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="add-tags-controls">
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

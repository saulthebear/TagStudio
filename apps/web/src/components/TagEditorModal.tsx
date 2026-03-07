import { type TagCreatePayload, type TagResponse, type TagUpdatePayload } from "@tagstudio/api-client";
import { Button } from "@tagstudio/ui";

import { ModalLayerPortal } from "@/components/ModalLayerPortal";
import { useTagEditorWorkflow } from "@/hooks/useTagEditorWorkflow";

type TagEditorModalProps = {
  open: boolean;
  mode: "create" | "edit";
  tag: TagResponse | null;
  initialName?: string;
  onClose: () => void;
  onCreate: (payload: TagCreatePayload) => Promise<TagResponse | null>;
  onUpdate: (tagId: number, payload: TagUpdatePayload) => Promise<TagResponse | null>;
  onSaved?: (tag: TagResponse) => void;
};

const LIMIT_OPTIONS: Array<{ label: string; value: number }> = [
  { label: "25", value: 25 },
  { label: "50", value: 50 },
  { label: "100", value: 100 },
  { label: "250", value: 250 },
  { label: "500", value: 500 },
  { label: "All", value: -1 }
];

export function TagEditorModal({
  open,
  mode,
  tag,
  initialName,
  onClose,
  onCreate,
  onUpdate,
  onSaved
}: TagEditorModalProps) {
  const workflow = useTagEditorWorkflow({
    open,
    mode,
    tag,
    initialName,
    onClose,
    onCreate,
    onUpdate,
    onSaved
  });

  if (!open) {
    return null;
  }

  return (
    <ModalLayerPortal open={open} onBackdropClick={onClose}>
      <div
        ref={workflow.tagEditorDrag.panelRef}
        className={`overlay-panel panel tag-editor-panel modal-draggable-panel ${workflow.tagEditorDrag.isDragging ? "modal-panel-dragging" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={mode === "create" ? "Create tag" : "Edit tag"}
        style={workflow.tagEditorDrag.panelStyle}
      >
        <div className="modal-drag-handle" {...workflow.tagEditorDrag.dragHandleProps}>
          <h2 className="panel-title m-0">{mode === "create" ? "New Tag" : "Edit Tag"}</h2>
        </div>

        <label className="settings-row">
          <span>Name</span>
          <input
            className="input-base"
            value={workflow.name}
            onChange={(event) => workflow.setName(event.target.value)}
            placeholder="Tag name"
          />
        </label>

        <label className="settings-row">
          <span>Shorthand</span>
          <input
            className="input-base"
            value={workflow.shorthand}
            onChange={(event) => workflow.setShorthand(event.target.value)}
            placeholder="Optional shorthand"
          />
        </label>

        <div className="settings-row">
          <span>Aliases</span>
          <div className="tag-editor-aliases">
            {workflow.aliases.map((alias, index) => (
              <div key={`alias-${index}`} className="tag-editor-alias-row">
                <input
                  className="input-base"
                  value={alias}
                  onChange={(event) => workflow.updateAlias(index, event.target.value)}
                  placeholder="Alias"
                />
                <Button variant="secondary" size="sm" onClick={() => workflow.removeAlias(index)}>
                  -
                </Button>
              </div>
            ))}
            <Button variant="secondary" size="sm" onClick={workflow.addAliasRow}>
              + Add Alias
            </Button>
          </div>
        </div>

        <div className="settings-row">
          <span>Parent Tags</span>
          <div className="tag-editor-parent-list">
            {workflow.selectedParents.length === 0 ? (
              <p className="tag-editor-empty">No parent tags selected.</p>
            ) : (
              workflow.selectedParents.map((parent) => (
                <div key={parent.id} className="tag-editor-parent-pill">
                  <span>{parent.name}</span>
                  <Button variant="secondary" size="sm" onClick={() => workflow.removeParent(parent.id)}>
                    Remove
                  </Button>
                </div>
              ))
            )}
          </div>
          <Button variant="secondary" size="sm" onClick={() => workflow.setParentPickerOpen(true)}>
            Add Parent Tag(s)
          </Button>
        </div>

        <div className="settings-row">
          <span>Disambiguation Parent</span>
          <select
            className="input-base"
            value={workflow.disambiguationId ? String(workflow.disambiguationId) : ""}
            onChange={(event) => {
              const nextValue = event.target.value;
              workflow.setDisambiguationId(nextValue ? Number(nextValue) : null);
            }}
          >
            <option value="">None</option>
            {workflow.selectedParents.map((parent) => (
              <option key={parent.id} value={String(parent.id)}>
                {parent.name}
              </option>
            ))}
          </select>
          <p className="tag-editor-hint">
            This parent name is shown in the UI as <strong>TagName (ParentName)</strong>.
          </p>
          {workflow.disambiguationLabel ? <p className="tag-editor-preview">Preview: {workflow.disambiguationLabel}</p> : null}
        </div>

        <div className="settings-row">
          <span>Color</span>
          <Button variant="secondary" onClick={() => workflow.setColorPickerOpen(true)}>
            {workflow.colorLabel}
          </Button>
        </div>

        <div className="settings-row">
          <span>Properties</span>
          <label className="settings-checkbox">
            <input
              className="toggle-base"
              type="checkbox"
              checked={workflow.isCategory}
              onChange={(event) => workflow.setIsCategory(event.target.checked)}
            />
            <span>Is Category</span>
          </label>
          <label className="settings-checkbox">
            <input
              className="toggle-base"
              type="checkbox"
              checked={workflow.isHidden}
              onChange={(event) => workflow.setIsHidden(event.target.checked)}
            />
            <span>Is Hidden</span>
          </label>
        </div>

        <div className="overlay-panel-actions">
          <Button variant="secondary" onClick={onClose} disabled={workflow.savePending}>
            Cancel
          </Button>
          <Button onClick={workflow.saveTag} disabled={!workflow.canSave}>
            {workflow.savePending ? "Saving..." : "Save"}
          </Button>
        </div>

        <ModalLayerPortal open={workflow.parentPickerOpen} onBackdropClick={() => workflow.setParentPickerOpen(false)}>
          <div
            ref={workflow.parentPickerDrag.panelRef}
            className={`overlay-panel panel tag-editor-subpanel modal-draggable-panel ${workflow.parentPickerDrag.isDragging ? "modal-panel-dragging" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-label="Add parent tags"
            style={workflow.parentPickerDrag.panelStyle}
          >
            <div className="modal-drag-handle" {...workflow.parentPickerDrag.dragHandleProps}>
              <h3 className="panel-title m-0">Add Parent Tag(s)</h3>
            </div>
            <div className="tag-editor-parent-controls">
              <input
                className="input-base"
                placeholder="Search tags"
                value={workflow.parentQuery}
                onChange={(event) => workflow.setParentQuery(event.target.value)}
              />
              <select
                className="input-base"
                value={String(workflow.parentLimit)}
                onChange={(event) => workflow.setParentLimit(Number(event.target.value))}
              >
                {LIMIT_OPTIONS.map((option) => (
                  <option key={option.label} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="tag-editor-parent-candidates">
              {workflow.parentCandidates.map((candidate) => {
                const alreadyAdded = workflow.parentIds.includes(candidate.id);
                return (
                  <button
                    key={candidate.id}
                    type="button"
                    className="tag-editor-candidate-row"
                    disabled={alreadyAdded}
                    onClick={() => workflow.addParent(candidate.id)}
                  >
                    <span>{candidate.name}</span>
                    <span>{alreadyAdded ? "Added" : "Add"}</span>
                  </button>
                );
              })}
            </div>
            <div className="overlay-panel-actions">
              <Button variant="secondary" onClick={() => workflow.setParentPickerOpen(false)}>
                Done
              </Button>
            </div>
          </div>
        </ModalLayerPortal>

        <ModalLayerPortal open={workflow.colorPickerOpen} onBackdropClick={() => workflow.setColorPickerOpen(false)}>
          <div
            ref={workflow.colorPickerDrag.panelRef}
            className={`overlay-panel panel tag-editor-subpanel modal-draggable-panel ${workflow.colorPickerDrag.isDragging ? "modal-panel-dragging" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-label="Choose tag color"
            style={workflow.colorPickerDrag.panelStyle}
          >
            <div className="modal-drag-handle" {...workflow.colorPickerDrag.dragHandleProps}>
              <h3 className="panel-title m-0">Choose Tag Color</h3>
            </div>
            <div className="tag-editor-color-grid">
              <button type="button" className="tag-editor-color-row" onClick={workflow.clearColor}>
                <span className="tag-editor-color-swatch" aria-hidden="true" />
                <span>No Color</span>
              </button>
              {workflow.colorGroups.map((group) => (
                <div key={group.namespace}>
                  <h4 className="tag-editor-color-title">{group.namespace_name}</h4>
                  {group.colors.map((color) => (
                    <button
                      key={`${group.namespace}/${color.slug}`}
                      type="button"
                      className="tag-editor-color-row"
                      title={`${group.namespace_name}: ${color.name}`}
                      aria-label={`${group.namespace_name}: ${color.name}`}
                      onClick={() => workflow.setColor(color.namespace, color.slug)}
                    >
                      <span
                        className="tag-editor-color-swatch"
                        style={{
                          background: color.primary,
                          borderColor: color.secondary ?? "#334155"
                        }}
                        aria-hidden="true"
                      />
                      <span>{color.name}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
            <div className="overlay-panel-actions">
              <Button variant="secondary" onClick={() => workflow.setColorPickerOpen(false)}>
                Done
              </Button>
            </div>
          </div>
        </ModalLayerPortal>
      </div>
    </ModalLayerPortal>
  );
}

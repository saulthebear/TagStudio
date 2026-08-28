import { useState } from "react";
import { type TagBatchUpdateRequest, type TagStatResponse, type TagType } from "@tagstudio/api-client";
import { Button } from "@tagstudio/ui";

import { ModalHeader } from "@/components/ModalHeader";
import { ModalLayerPortal } from "@/components/ModalLayerPortal";
import { useDraggableModalPosition } from "@/hooks/useDraggableModalPosition";

type TagBatchPropertiesModalProps = {
  open: boolean;
  selectedTags: TagStatResponse[];
  onClose: () => void;
  onApply: (payload: TagBatchUpdateRequest) => Promise<void>;
};

export function TagBatchPropertiesModal({
  open,
  selectedTags,
  onClose,
  onApply
}: TagBatchPropertiesModalProps) {
  const [tagType, setTagType] = useState<TagType | "no-change">("no-change");
  const [isHidden, setIsHidden] = useState<"no-change" | "true" | "false">("no-change");
  const [isCategory, setIsCategory] = useState<"no-change" | "true" | "false">("no-change");
  const [isPending, setIsPending] = useState(false);

  const draggableModal = useDraggableModalPosition({
    open,
    initialPlacement: "center",
    panelId: "tag-batch-properties-modal",
    savePositionOnClose: false
  });

  if (!open || selectedTags.length === 0) {
    return null;
  }

  const handleApply = async () => {
    const payload: TagBatchUpdateRequest = {
      tag_ids: selectedTags.map((t) => t.id),
      tag_type: tagType !== "no-change" ? tagType : undefined,
      is_hidden: isHidden === "no-change" ? undefined : isHidden === "true",
      is_category: isCategory === "no-change" ? undefined : isCategory === "true"
    };

    setIsPending(true);
    try {
      await onApply(payload);
      onClose();
    } finally {
      setIsPending(false);
    }
  };

  return (
    <ModalLayerPortal open={open} onBackdropClick={onClose}>
      <div
        ref={draggableModal.panelRef}
        className={`overlay-panel panel tag-workflow-panel modal-draggable-panel ${draggableModal.isDragging ? "modal-panel-dragging" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Edit Properties for Selected Tags"
        style={{ ...draggableModal.panelStyle, maxWidth: 440 }}
      >
        <ModalHeader
          title={`Edit Properties (${selectedTags.length} tags)`}
          dragHandleProps={draggableModal.dragHandleProps}
          onClose={onClose}
        />

        <div className="tag-merge-body">
          <label className="settings-row">
            <span>Tag Type</span>
            <select
              className="input-base"
              value={tagType}
              onChange={(e) => setTagType(e.target.value as TagType | "no-change")}
            >
              <option value="no-change">— Do not change —</option>
              <option value="content">Content (Normal)</option>
              <option value="meta">Meta</option>
              <option value="system">System</option>
            </select>
          </label>

          <label className="settings-row">
            <span>Hidden Status</span>
            <select
              className="input-base"
              value={isHidden}
              onChange={(e) => setIsHidden(e.target.value as "no-change" | "true" | "false")}
            >
              <option value="no-change">— Do not change —</option>
              <option value="true">Mark as Hidden</option>
              <option value="false">Mark as Visible</option>
            </select>
          </label>

          <label className="settings-row">
            <span>Category Status</span>
            <select
              className="input-base"
              value={isCategory}
              onChange={(e) => setIsCategory(e.target.value as "no-change" | "true" | "false")}
            >
              <option value="no-change">— Do not change —</option>
              <option value="true">Mark as Category</option>
              <option value="false">Mark as Normal Tag</option>
            </select>
          </label>

          <p className="tag-editor-hint mt-2">
            Applying changes will update properties across all <strong>{selectedTags.length} selected tags</strong>.
          </p>
        </div>

        <div className="overlay-panel-actions">
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleApply}
            disabled={isPending || (tagType === "no-change" && isHidden === "no-change" && isCategory === "no-change")}
          >
            {isPending ? "Applying..." : "Apply to Selected"}
          </Button>
        </div>
      </div>
    </ModalLayerPortal>
  );
}

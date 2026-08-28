import { useMemo, useState } from "react";
import { type TagColorNamespaceResponse, type TagResponse, type TagStatResponse } from "@tagstudio/api-client";
import { Button } from "@tagstudio/ui";
import { Virtuoso } from "react-virtuoso";
import { Search } from "lucide-react";

import { ModalHeader } from "@/components/ModalHeader";
import { ModalLayerPortal } from "@/components/ModalLayerPortal";
import { useDraggableModalPosition } from "@/hooks/useDraggableModalPosition";
import { createTagColorLookup, resolveTagChipStyle } from "@/lib/tag-styles";
import { createTagDisplayContext, getTagDisplayLabel, scoreTags } from "@/lib/tag-workflows";

type TagBatchParentModalProps = {
  open: boolean;
  selectedTags: TagStatResponse[];
  allTags: TagResponse[];
  tagColors?: TagColorNamespaceResponse[];
  onClose: () => void;
  onAddParent: (parentId: number) => Promise<void>;
};

export function TagBatchParentModal({
  open,
  selectedTags,
  allTags,
  tagColors,
  onClose,
  onAddParent
}: TagBatchParentModalProps) {
  const [query, setQuery] = useState("");
  const [selectedParentId, setSelectedParentId] = useState<number | null>(null);
  const [isPending, setIsPending] = useState(false);

  const selectedTagIdSet = useMemo(() => new Set(selectedTags.map((t) => t.id)), [selectedTags]);
  const colorLookup = useMemo(() => createTagColorLookup(tagColors), [tagColors]);

  const candidates = useMemo(() => {
    // Exclude selected tags themselves from being parent to avoid self loops
    const filtered = allTags.filter((t) => !selectedTagIdSet.has(t.id));
    return scoreTags(filtered, query);
  }, [allTags, query, selectedTagIdSet]);

  const displayContext = useMemo(() => createTagDisplayContext(allTags), [allTags]);

  const draggableModal = useDraggableModalPosition({
    open,
    initialPlacement: "center",
    panelId: "tag-batch-parent-modal",
    savePositionOnClose: false
  });

  if (!open || selectedTags.length === 0) {
    return null;
  }

  const handleApply = async () => {
    if (!selectedParentId || isPending) return;
    setIsPending(true);
    try {
      await onAddParent(selectedParentId);
      onClose();
    } finally {
      setIsPending(false);
    }
  };

  const chosenParentTag = allTags.find((t) => t.id === selectedParentId);

  return (
    <ModalLayerPortal open={open} onBackdropClick={onClose}>
      <div
        ref={draggableModal.panelRef}
        className={`overlay-panel panel tag-workflow-panel modal-draggable-panel ${draggableModal.isDragging ? "modal-panel-dragging" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Add Parent to Selected Tags"
        style={{ ...draggableModal.panelStyle, maxWidth: 480 }}
      >
        <ModalHeader
          title={`Add Parent Tag (${selectedTags.length} tags)`}
          dragHandleProps={draggableModal.dragHandleProps}
          onClose={onClose}
        />

        <div className="tag-merge-body">
          <div className="relative mb-3">
            <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
            <input
              className="input-base pl-8 w-full"
              placeholder="Search parent tags..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          </div>

          <div className="tag-batch-parent-list border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden">
            <Virtuoso
              data={candidates}
              style={{ height: 260 }}
              itemContent={(_, candidate) => {
                const isSelected = candidate.id === selectedParentId;
                const style = resolveTagChipStyle(candidate, colorLookup);
                const label = getTagDisplayLabel(candidate, displayContext);

                return (
                  <div
                    key={candidate.id}
                    className={`add-tags-row cursor-pointer ${isSelected ? "add-tags-row-highlighted" : ""}`}
                    onClick={() => setSelectedParentId(candidate.id)}
                  >
                    <div className="flex items-center justify-between w-full px-2 py-1.5">
                      <span className="add-tags-row-label-chip" style={style}>
                        {label}
                      </span>
                      {isSelected ? (
                        <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                          Selected
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              }}
            />
          </div>

          {chosenParentTag ? (
            <p className="tag-editor-hint mt-2">
              Will set <strong>"{chosenParentTag.name}"</strong> as a parent tag for all <strong>{selectedTags.length} selected tags</strong>.
            </p>
          ) : (
            <p className="tag-editor-hint mt-2">Select a parent tag from above to apply.</p>
          )}
        </div>

        <div className="overlay-panel-actions">
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={!selectedParentId || isPending}>
            {isPending ? "Assigning..." : "Assign Parent Tag"}
          </Button>
        </div>
      </div>
    </ModalLayerPortal>
  );
}

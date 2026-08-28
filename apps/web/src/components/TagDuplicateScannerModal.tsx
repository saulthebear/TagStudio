import { useMemo } from "react";
import { type TagColorNamespaceResponse, type TagResponse, type TagStatResponse } from "@tagstudio/api-client";
import { Button } from "@tagstudio/ui";
import { CheckCircle2, Copy, Sparkles } from "lucide-react";

import { ModalHeader } from "@/components/ModalHeader";
import { ModalLayerPortal } from "@/components/ModalLayerPortal";
import { useDraggableModalPosition } from "@/hooks/useDraggableModalPosition";
import { detectDuplicateTags, type DuplicateCluster } from "@/lib/tag-duplicates";
import { createTagColorLookup, resolveTagChipStyle } from "@/lib/tag-styles";
import { createTagDisplayContext, getTagDisplayLabel } from "@/lib/tag-workflows";

type TagDuplicateScannerModalProps = {
  open: boolean;
  tags: TagStatResponse[];
  allTags?: TagResponse[];
  tagColors?: TagColorNamespaceResponse[];
  onClose: () => void;
  onSelectClusterToMerge: (cluster: DuplicateCluster) => void;
};

export function TagDuplicateScannerModal({
  open,
  tags,
  allTags = [],
  tagColors,
  onClose,
  onSelectClusterToMerge
}: TagDuplicateScannerModalProps) {
  const colorLookup = useMemo(() => createTagColorLookup(tagColors), [tagColors]);

  const displayContext = useMemo(
    () => createTagDisplayContext(allTags.length > 0 ? allTags : tags),
    [allTags, tags]
  );

  const clusters = useMemo(() => {
    if (!open) return [];
    return detectDuplicateTags(tags);
  }, [open, tags]);

  const draggableModal = useDraggableModalPosition({
    open,
    initialPlacement: "center",
    panelId: "tag-duplicate-scanner-modal",
    savePositionOnClose: false
  });

  if (!open) {
    return null;
  }

  return (
    <ModalLayerPortal open={open} onBackdropClick={onClose}>
      <div
        ref={draggableModal.panelRef}
        className={`overlay-panel panel tag-workflow-panel modal-draggable-panel ${draggableModal.isDragging ? "modal-panel-dragging" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Duplicate Tag Scanner"
        style={{ ...draggableModal.panelStyle, maxWidth: 620, maxHeight: "80vh" }}
      >
        <ModalHeader
          title="Scan for Duplicate Tags"
          dragHandleProps={draggableModal.dragHandleProps}
          onClose={onClose}
        />

        <div className="tag-duplicate-scanner-body">
          <div className="tag-duplicate-scanner-header">
            <Sparkles size={16} className="text-amber-500 flex-shrink-0" />
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Scanned <strong>{tags.length} tags</strong> across your library. Found <strong>{clusters.length} duplicate groups</strong> based on casing, pluralization, and spelling similarity (excluding disambiguated tags).
            </p>
          </div>

          {clusters.length === 0 ? (
            <div className="tag-duplicate-empty">
              <CheckCircle2 size={36} className="text-emerald-500 mb-2" />
              <p className="font-semibold text-sm">No duplicate tags detected!</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Your tag collection is clean and well-organized.
              </p>
            </div>
          ) : (
            <div className="tag-duplicate-cluster-list">
              {clusters.map((cluster) => {
                return (
                  <div key={cluster.id} className="tag-duplicate-cluster-card">
                    <div className="tag-duplicate-cluster-info">
                      <div className="flex items-center gap-2">
                        <span className="tag-duplicate-reason-badge">{cluster.reason}</span>
                        <span className="text-xs text-slate-400">({cluster.tags.length} tags)</span>
                      </div>

                      <div className="tag-duplicate-chips-wrap">
                        {cluster.tags.map((t) => {
                          const style = resolveTagChipStyle(t, colorLookup);
                          const isSuggestedTarget = t.id === cluster.suggestedTargetId;
                          const label = getTagDisplayLabel(t, displayContext);

                          return (
                            <span
                              key={t.id}
                              className={`tag-selected-chip ${isSuggestedTarget ? "ring-1 ring-blue-500 font-semibold" : "opacity-90"}`}
                              style={style}
                            >
                              <span>{label}</span>
                              <span className="text-xs opacity-75">({t.entry_count})</span>
                              {isSuggestedTarget ? (
                                <span className="text-[10px] uppercase tracking-wide bg-blue-500 text-white rounded px-1 ml-1">
                                  Keep
                                </span>
                              ) : null}
                            </span>
                          );
                        })}
                      </div>
                    </div>

                    <Button
                      size="sm"
                      onClick={() => onSelectClusterToMerge(cluster)}
                      className="tag-duplicate-merge-btn"
                    >
                      <Copy size={13} className="mr-1" />
                      Merge
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="overlay-panel-actions">
          <Button variant="secondary" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </ModalLayerPortal>
  );
}

import {
  type EntryResponse,
  type EntrySummaryResponse,
  type FieldTypeResponse,
  type PreviewResponse,
  type TagCreatePayload,
  type TagResponse,
  type TagUpdatePayload
} from "@tagstudio/api-client";
import { ChevronLeft, ChevronRight, FileText, RotateCcw, Tag, Trash2, X, ZoomIn, ZoomOut } from "lucide-react";
import { type MouseEvent, type SyntheticEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AddTagsModal } from "@/components/AddTagsModal";
import { MetadataContent } from "@/components/InspectorPane";
import { findMatchingShortcut } from "@/lib/shortcuts";

export type FullScreenMediaViewProps = {
  selectedEntry: EntryResponse | null;
  selectedEntryIds?: number[];
  selectedEntries?: EntrySummaryResponse[];
  preview: PreviewResponse | undefined;
  getMediaUrl: (entryId: number) => string;
  getThumbnailUrl: (
    entryId: number,
    options?: {
      size?: number;
      fit?: "cover" | "contain";
      kind?: "grid" | "preview";
    }
  ) => string;
  resolveApiUrl: (path: string) => string;
  videoPreviewStartsMuted: boolean;
  onVideoPreviewUnmuted: () => void;
  onToggleMute?: () => void;
  onToggleFavorite?: () => void;
  onOpenShortcutsHelp?: () => void;
  onClose: () => void;
  onNavigatePrevious: () => void;
  onNavigateNext: () => void;
  hasPrevious: boolean;
  hasNext: boolean;
  allTags?: TagResponse[];
  fieldTypes?: FieldTypeResponse[];
  fieldDrafts?: Record<string, string>;
  newFieldKey?: string;
  newFieldValue?: string;
  tagMutationPending?: boolean;
  tagEditPending?: boolean;
  updateFieldPending?: boolean;
  canPasteTags?: boolean;
  onAddTagToEntries?: (entryIds: number[], tagId: number) => Promise<void>;
  onPasteTagsToEntries?: (entryIds: number[]) => void;
  onRemoveTagFromEntries?: (entryIds: number[], tagId: number) => Promise<void>;
  onCreateTag?: (payload: TagCreatePayload) => Promise<TagResponse | null>;
  onUpdateTag?: (tagId: number, payload: TagUpdatePayload) => Promise<TagResponse | null>;
  onRefreshSelection?: () => Promise<void>;
  onFieldDraftChange?: (fieldKey: string, value: string) => void;
  onSaveField?: (fieldKey: string, value: string) => void;
  onNewFieldKeyChange?: (value: string) => void;
  onNewFieldValueChange?: (value: string) => void;
  onApplyField?: () => void;
  onDeleteEntries?: () => void;
};

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
const ZOOM_STEP = 0.05;

const ANIMATED_IMAGE_SUFFIXES = new Set(["gif", "apng", "webp"]);
const ANIMATED_IMAGE_MEDIA_TYPES = new Set(["image/gif", "image/apng", "image/webp"]);

const normalizeSuffix = (suffix?: string | null): string => suffix?.trim().toLowerCase().replace(/^\./, "") ?? "";

function isAnimatedFormat(suffix?: string | null, mediaType?: string | null): boolean {
  return (
    ANIMATED_IMAGE_SUFFIXES.has(normalizeSuffix(suffix)) ||
    (mediaType != null && ANIMATED_IMAGE_MEDIA_TYPES.has(mediaType.toLowerCase()))
  );
}

export function FullScreenMediaView({
  selectedEntry,
  selectedEntryIds = [],
  selectedEntries = [],
  preview,
  getMediaUrl,
  getThumbnailUrl,
  resolveApiUrl,
  videoPreviewStartsMuted,
  onVideoPreviewUnmuted,
  onToggleMute,
  onToggleFavorite,
  onOpenShortcutsHelp,
  onClose,
  onNavigatePrevious,
  onNavigateNext,
  hasPrevious,
  hasNext,
  allTags = [],
  fieldTypes = [],
  fieldDrafts = {},
  newFieldKey = "",
  newFieldValue = "",
  tagMutationPending = false,
  tagEditPending = false,
  updateFieldPending = false,
  canPasteTags = false,
  onAddTagToEntries,
  onPasteTagsToEntries,
  onRemoveTagFromEntries,
  onCreateTag,
  onUpdateTag,
  onRefreshSelection,
  onFieldDraftChange,
  onSaveField,
  onNewFieldKeyChange,
  onNewFieldValueChange,
  onApplyField,
  onDeleteEntries
}: FullScreenMediaViewProps) {
  const [zoomScale, setZoomScale] = useState(1);
  const [panPosition, setPanPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [addTagsOpen, setAddTagsOpen] = useState(false);
  const [metadataOpen, setMetadataOpen] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; initialPanX: number; initialPanY: number } | null>(null);

  // Reset zoom & pan when selected entry changes
  useEffect(() => {
    setZoomScale(1);
    setPanPosition({ x: 0, y: 0 });
    setAddTagsOpen(false);
  }, [selectedEntry?.id]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        if (addTagsOpen) {
          setAddTagsOpen(false);
        } else if (metadataOpen) {
          setMetadataOpen(false);
        } else {
          onClose();
        }
        return;
      }

      const match = findMatchingShortcut(event, "fullscreen");
      if (!match) {
        return;
      }

      if (match.id === "toggle-fullscreen") {
        event.preventDefault();
        onClose();
        return;
      }

      if (match.id === "toggle-mute") {
        event.preventDefault();
        onToggleMute?.();
        return;
      }

      if (match.id === "toggle-add-tags") {
        event.preventDefault();
        setAddTagsOpen((prev) => !prev);
        return;
      }

      if (match.id === "toggle-metadata") {
        event.preventDefault();
        setMetadataOpen((prev) => !prev);
        return;
      }

      if (match.id === "toggle-favorite") {
        event.preventDefault();
        onToggleFavorite?.();
        return;
      }

      if (match.id === "navigate-prev") {
        event.preventDefault();
        onNavigatePrevious();
        return;
      }

      if (match.id === "navigate-next") {
        event.preventDefault();
        onNavigateNext();
        return;
      }

      if (match.id === "show-help") {
        event.preventDefault();
        onOpenShortcutsHelp?.();
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    addTagsOpen,
    metadataOpen,
    onClose,
    onNavigateNext,
    onNavigatePrevious,
    onOpenShortcutsHelp,
    onToggleFavorite,
    onToggleMute
  ]);

  const handleZoomChange = useCallback((newScale: number) => {
    const clampedScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newScale));
    setZoomScale(clampedScale);
    if (clampedScale === 1) {
      setPanPosition({ x: 0, y: 0 });
    }
  }, []);

  const handleResetZoom = useCallback(() => {
    setZoomScale(1);
    setPanPosition({ x: 0, y: 0 });
  }, []);

  const handleZoomIn = useCallback(() => {
    handleZoomChange(zoomScale + 0.25);
  }, [handleZoomChange, zoomScale]);

  const handleZoomOut = useCallback(() => {
    handleZoomChange(zoomScale - 0.25);
  }, [handleZoomChange, zoomScale]);

  const handleDoubleClick = useCallback(() => {
    if (zoomScale > 1) {
      handleResetZoom();
    } else {
      handleZoomChange(2);
    }
  }, [handleResetZoom, handleZoomChange, zoomScale]);

  const handleWheel = useCallback(
    (event: React.WheelEvent) => {
      event.preventDefault();
      const delta = event.deltaY < 0 ? 0.15 : -0.15;
      handleZoomChange(zoomScale + delta);
    },
    [handleZoomChange, zoomScale]
  );

  const handleMouseDown = useCallback(
    (event: MouseEvent) => {
      if (zoomScale <= 1) return;
      event.preventDefault();
      setIsDragging(true);
      dragStartRef.current = {
        x: event.clientX,
        y: event.clientY,
        initialPanX: panPosition.x,
        initialPanY: panPosition.y
      };
    },
    [panPosition.x, panPosition.y, zoomScale]
  );

  const handleMouseMove = useCallback(
    (event: MouseEvent) => {
      if (!isDragging || !dragStartRef.current) return;
      event.preventDefault();
      const dx = event.clientX - dragStartRef.current.x;
      const dy = event.clientY - dragStartRef.current.y;
      setPanPosition({
        x: dragStartRef.current.initialPanX + dx,
        y: dragStartRef.current.initialPanY + dy
      });
    },
    [isDragging]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    dragStartRef.current = null;
  }, []);

  const animatedImageSource = useMemo(() => {
    if (!selectedEntry || preview?.preview_kind !== "image") {
      return null;
    }
    if (!isAnimatedFormat(selectedEntry.suffix, preview.media_type)) {
      return null;
    }
    return preview.media_url ? resolveApiUrl(preview.media_url) : getMediaUrl(selectedEntry.id);
  }, [getMediaUrl, preview, resolveApiUrl, selectedEntry]);

  const handleVideoVolumeChange = useCallback((event: SyntheticEvent<HTMLVideoElement>) => {
    if (!event.currentTarget.muted) {
      onVideoPreviewUnmuted();
    }
  }, [onVideoPreviewUnmuted]);

  const entryTagIdsByEntry = useMemo(() => {
    if (!selectedEntry) return new Map<number, Set<number>>();
    return new Map([[selectedEntry.id, new Set(selectedEntry.tags.map((t) => t.id))]]);
  }, [selectedEntry]);

  const effectiveSelectedEntryIds = useMemo(() => {
    if (selectedEntryIds.length > 0) return selectedEntryIds;
    return selectedEntry ? [selectedEntry.id] : [];
  }, [selectedEntry, selectedEntryIds]);

  if (!selectedEntry) {
    return null;
  }

  const isImage = preview?.preview_kind === "image";
  const isVideo = preview?.preview_kind === "video";

  return (
    <div className="fullscreen-modal-overlay" onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
      {/* Media Viewport (Full Screen Base Layout) */}
      <div
        className={`fullscreen-modal-viewport ${metadataOpen ? "fullscreen-viewport-with-drawer" : ""}`}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onDoubleClick={handleDoubleClick}
        style={{
          cursor: zoomScale > 1 ? (isDragging ? "grabbing" : "grab") : "zoom-in"
        }}
      >
        {/* Media Content Wrapper */}
        <div
          className="fullscreen-media-container"
          style={{
            transform: `translate(${panPosition.x}px, ${panPosition.y}px) scale(${zoomScale})`,
            transition: isDragging ? "none" : "transform 0.1s ease-out"
          }}
        >
          {isImage ? (
            <img
              src={
                animatedImageSource ??
                (preview.thumbnail_url
                  ? resolveApiUrl(preview.thumbnail_url)
                  : getThumbnailUrl(selectedEntry.id, { kind: "preview", fit: "contain" }))
              }
              alt={selectedEntry.filename}
              className="fullscreen-media-img"
              draggable={false}
            />
          ) : isVideo ? (
            <video
              src={getMediaUrl(selectedEntry.id)}
              poster={
                preview.poster_url
                  ? resolveApiUrl(preview.poster_url)
                  : getThumbnailUrl(selectedEntry.id, { kind: "preview", fit: "contain" })
              }
              preload="metadata"
              autoPlay
              loop
              muted={videoPreviewStartsMuted}
              onVolumeChange={handleVideoVolumeChange}
              playsInline
              controls
              className="fullscreen-media-video"
            />
          ) : (
            <div className="text-white text-center p-4">Preview not available in full screen</div>
          )}
        </div>
      </div>

      {/* Collapsable Metadata Side Drawer */}
      <aside className={`fullscreen-metadata-drawer ${metadataOpen ? "fullscreen-metadata-drawer-open" : ""}`}>
        <div className="fullscreen-drawer-header">
          <h2 className="text-base font-semibold text-slate-100 m-0">Metadata</h2>
          <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
            {onDeleteEntries ? (
              <button
                type="button"
                className="inspector-delete-btn"
                onClick={onDeleteEntries}
                aria-label="Move to trash"
                title="Move to Trash"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            ) : null}
            <button
              type="button"
              className="fullscreen-control-icon-btn"
              onClick={() => setMetadataOpen(false)}
              aria-label="Close metadata panel"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="fullscreen-drawer-body">
          {onAddTagToEntries &&
          onPasteTagsToEntries &&
          onRemoveTagFromEntries &&
          onCreateTag &&
          onUpdateTag &&
          onRefreshSelection &&
          onFieldDraftChange &&
          onSaveField &&
          onNewFieldKeyChange &&
          onNewFieldValueChange &&
          onApplyField ? (
            <MetadataContent
              selectedEntry={selectedEntry}
              selectedEntryIds={effectiveSelectedEntryIds}
              selectedEntries={selectedEntries}
              fieldDrafts={fieldDrafts}
              newFieldKey={newFieldKey}
              newFieldValue={newFieldValue}
              allTags={allTags}
              fieldTypes={fieldTypes}
              tagMutationPending={tagMutationPending}
              tagEditPending={tagEditPending}
              updateFieldPending={updateFieldPending}
              canPasteTags={canPasteTags}
              onAddTagToEntries={onAddTagToEntries}
              onPasteTagsToEntries={onPasteTagsToEntries}
              onRemoveTagFromEntries={onRemoveTagFromEntries}
              onCreateTag={onCreateTag}
              onUpdateTag={onUpdateTag}
              onRefreshSelection={onRefreshSelection}
              onFieldDraftChange={onFieldDraftChange}
              onSaveField={onSaveField}
              onNewFieldKeyChange={onNewFieldKeyChange}
              onNewFieldValueChange={onNewFieldValueChange}
              onApplyField={onApplyField}
              openAddTagsRequestNonce={0}
            />
          ) : (
            <p className="text-sm text-slate-400">Metadata not available.</p>
          )}
        </div>
      </aside>

      {/* Floating Vertical Control Bar on Right */}
      <div className="fullscreen-controls-bar" onClick={(e) => e.stopPropagation()}>
        {/* Close Button (returns to standard view) */}
        <button
          type="button"
          className="fullscreen-control-icon-btn fullscreen-close-icon-btn"
          onClick={onClose}
          aria-label="Exit full screen mode"
          title="Exit full screen"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="fullscreen-controls-divider" />

        {/* Metadata Panel Toggle Button */}
        <button
          type="button"
          className={`fullscreen-control-icon-btn ${metadataOpen ? "fullscreen-control-icon-btn-active" : ""}`}
          onClick={() => setMetadataOpen((prev) => !prev)}
          aria-label="Toggle metadata panel"
          title="Toggle Metadata Panel"
        >
          <FileText className="h-4 w-4" />
        </button>

        {/* Add Tag Button */}
        {onAddTagToEntries && onCreateTag && onUpdateTag ? (
          <button
            type="button"
            className="fullscreen-control-icon-btn"
            onClick={() => setAddTagsOpen(true)}
            aria-label="Add tag to file"
            title="Add Tag"
          >
            <Tag className="h-4 w-4" />
          </button>
        ) : null}

        <div className="fullscreen-controls-divider" />

        {/* Zoom In Button */}
        <button
          type="button"
          className="fullscreen-control-icon-btn"
          onClick={handleZoomIn}
          disabled={zoomScale >= MAX_ZOOM}
          aria-label="Zoom in"
          title="Zoom in"
        >
          <ZoomIn className="h-4 w-4" />
        </button>

        {/* Zoom Level Continuous Vertical Slider */}
        <div className="fullscreen-zoom-slider-wrapper">
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={ZOOM_STEP}
            value={zoomScale}
            onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
            className="fullscreen-zoom-slider"
            aria-label="Zoom level slider"
          />
        </div>

        {/* Zoom Out Button */}
        <button
          type="button"
          className="fullscreen-control-icon-btn"
          onClick={handleZoomOut}
          disabled={zoomScale <= MIN_ZOOM}
          aria-label="Zoom out"
          title="Zoom out"
        >
          <ZoomOut className="h-4 w-4" />
        </button>

        {/* Percentage Indicator */}
        <span className="fullscreen-zoom-badge">{Math.round(zoomScale * 100)}%</span>

        {/* Reset Zoom Button */}
        <button
          type="button"
          className="fullscreen-control-icon-btn"
          onClick={handleResetZoom}
          disabled={zoomScale === 1 && panPosition.x === 0 && panPosition.y === 0}
          aria-label="Reset zoom and pan"
          title="Reset zoom"
        >
          <RotateCcw className="h-4 w-4" />
        </button>

        <div className="fullscreen-controls-divider" />

        {/* Previous File Button */}
        <button
          type="button"
          className="fullscreen-control-icon-btn"
          onClick={onNavigatePrevious}
          disabled={!hasPrevious}
          aria-label="Previous file"
          title="Previous file (Left Arrow)"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {/* Next File Button */}
        <button
          type="button"
          className="fullscreen-control-icon-btn"
          onClick={onNavigateNext}
          disabled={!hasNext}
          aria-label="Next file"
          title="Next file (Right Arrow)"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Add Tags Modal (rendered as portal on top of base page layout) */}
      {addTagsOpen && onAddTagToEntries && onCreateTag && onUpdateTag ? (
        <AddTagsModal
          open={addTagsOpen}
          allTags={allTags}
          selectedEntryIds={selectedEntry ? [selectedEntry.id] : []}
          entryTagIdsByEntry={entryTagIdsByEntry}
          onClose={() => {
            setAddTagsOpen(false);
            void onRefreshSelection?.();
          }}
          onAddTagToEntries={onAddTagToEntries}
          onCreateTag={onCreateTag}
          onUpdateTag={onUpdateTag}
          onAfterTagChanged={async () => {
            await onRefreshSelection?.();
          }}
        />
      ) : null}
    </div>
  );
}

import {
  type EntryResponse,
  type EntrySummaryResponse,
  type FieldTypeResponse,
  type PreviewResponse,
  type TagCreatePayload,
  type TagResponse,
  type TagUpdatePayload
} from "@tagstudio/api-client";
import { Button } from "@tagstudio/ui";
import { ChevronDown, ChevronRight, Maximize2, Trash2 } from "lucide-react";
import { type SyntheticEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AddTagsModal } from "@/components/AddTagsModal";
import { SplitPane, type SplitPaneState } from "@/components/SplitPane";
import { TagEditorModal } from "@/components/TagEditorModal";
import { useSuggestedTags } from "@/hooks/useSuggestedTags";
import { useTagColors } from "@/hooks/useTagColors";
import { createTagColorLookup, resolveTagChipStyle } from "@/lib/tag-styles";
import {
  buildTagAncestryMap,
  computeInheritedTagRows,
  createTagDisplayContext,
  formatSuggestedTagTooltip,
  getTagDisplayLabel,
  type InheritedTagRow
} from "@/lib/tag-workflows";

type InspectorPaneProps = {
  selectedEntry: EntryResponse | null;
  selectedEntryIds: number[];
  selectedEntries: EntrySummaryResponse[];
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
  fieldDrafts: Record<string, string>;
  newFieldKey: string;
  newFieldValue: string;
  allTags: TagResponse[];
  fieldTypes: FieldTypeResponse[];
  tagMutationPending: boolean;
  tagEditPending: boolean;
  updateFieldPending: boolean;
  canPasteTags: boolean;
  onAddTagToEntries: (entryIds: number[], tagId: number) => Promise<void>;
  onPasteTagsToEntries: (entryIds: number[]) => void;
  onRemoveTagFromEntries: (entryIds: number[], tagId: number) => Promise<void>;
  onCreateTag: (payload: TagCreatePayload) => Promise<TagResponse | null>;
  onUpdateTag: (tagId: number, payload: TagUpdatePayload) => Promise<TagResponse | null>;
  onRefreshSelection: () => Promise<void>;
  onFieldDraftChange: (fieldKey: string, value: string) => void;
  onSaveField: (fieldKey: string, value: string) => void;
  onNewFieldKeyChange: (value: string) => void;
  onNewFieldValueChange: (value: string) => void;
  onApplyField: () => void;
  splitState: SplitPaneState;
  onSplitStateChange: (next: SplitPaneState) => void;
  disableSplit: boolean;
  mobileSection: "preview" | "metadata";
  addTagsModalRequestNonce: number;
  videoPreviewStartsMuted: boolean;
  onVideoPreviewUnmuted: () => void;
  onOpenFullScreen?: () => void;
  onDeleteEntries?: () => void;
};

type AggregateTagRow = {
  tagId: number;
  count: number;
  state: "all" | "partial";
  tag: TagResponse | null;
};

const ANIMATED_IMAGE_SUFFIXES = new Set(["gif", "apng", "webp"]);
const ANIMATED_IMAGE_MEDIA_TYPES = new Set(["image/gif", "image/apng", "image/webp"]);

const normalizeSuffix = (suffix?: string | null): string => suffix?.trim().toLowerCase().replace(/^\./, "") ?? "";

function isAnimatedFormat(suffix?: string | null, mediaType?: string | null): boolean {
  return (
    ANIMATED_IMAGE_SUFFIXES.has(normalizeSuffix(suffix)) ||
    (mediaType != null && ANIMATED_IMAGE_MEDIA_TYPES.has(mediaType.toLowerCase()))
  );
}

export function InspectorPane({
  selectedEntry,
  selectedEntryIds,
  selectedEntries,
  preview,
  getMediaUrl,
  getThumbnailUrl,
  resolveApiUrl,
  fieldDrafts,
  newFieldKey,
  newFieldValue,
  allTags,
  fieldTypes,
  tagMutationPending,
  tagEditPending,
  updateFieldPending,
  canPasteTags,
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
  splitState,
  onSplitStateChange,
  disableSplit,
  mobileSection,
  addTagsModalRequestNonce,
  videoPreviewStartsMuted,
  onVideoPreviewUnmuted,
  onOpenFullScreen,
  onDeleteEntries
}: InspectorPaneProps) {
  const previewSection = (
    <div className="inspector-section">
      <h2 className="panel-title m-0">Preview</h2>
      <PreviewContent
        selectedEntry={selectedEntry}
        preview={preview}
        getMediaUrl={getMediaUrl}
        getThumbnailUrl={getThumbnailUrl}
        resolveApiUrl={resolveApiUrl}
        videoPreviewStartsMuted={videoPreviewStartsMuted}
        onVideoPreviewUnmuted={onVideoPreviewUnmuted}
        onOpenFullScreen={onOpenFullScreen}
      />
    </div>
  );

  const metadataSection = (
    <div className="inspector-section inspector-meta-section">
      <div className="inspector-meta-section-header">
        <h2 className="panel-title m-0">Metadata</h2>
        {onDeleteEntries ? (
          <button
            type="button"
            className="inspector-delete-btn"
            onClick={onDeleteEntries}
            disabled={selectedEntryIds.length === 0}
            aria-label="Move to trash"
            title="Move to Trash"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
      <MetadataContent
        selectedEntry={selectedEntry}
        selectedEntryIds={selectedEntryIds}
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
        openAddTagsRequestNonce={addTagsModalRequestNonce}
      />
    </div>
  );

  if (disableSplit) {
    return (
      <section className="pane panel inspector-pane">
        {mobileSection === "preview" ? previewSection : metadataSection}
      </section>
    );
  }

  return (
    <section className="pane panel inspector-pane">
      <SplitPane
        orientation="vertical"
        state={splitState}
        onStateChange={onSplitStateChange}
        primary={previewSection}
        secondary={metadataSection}
        primaryLabel="Preview"
        secondaryLabel="Metadata"
        minPrimarySize={220}
        minSecondarySize={220}
        collapseThreshold={90}
        resetRatio={0.52}
        railSize={12}
        handleSize={12}
        className="inspector-split"
      />
    </section>
  );
}

type PreviewContentProps = {
  selectedEntry: EntryResponse | null;
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
  onOpenFullScreen?: () => void;
};

function PreviewContent({
  selectedEntry,
  preview,
  getMediaUrl,
  getThumbnailUrl,
  resolveApiUrl,
  videoPreviewStartsMuted,
  onVideoPreviewUnmuted,
  onOpenFullScreen
}: PreviewContentProps) {
  const hasSelectedEntry = selectedEntry !== null;
  const animatedImageSource = useMemo(() => {
    if (!hasSelectedEntry || preview?.preview_kind !== "image") {
      return null;
    }
    if (!isAnimatedFormat(selectedEntry.suffix, preview.media_type)) {
      return null;
    }
    return preview.media_url ? resolveApiUrl(preview.media_url) : getMediaUrl(selectedEntry.id);
  }, [getMediaUrl, hasSelectedEntry, preview, resolveApiUrl, selectedEntry]);
  const handleVideoVolumeChange = useCallback((event: SyntheticEvent<HTMLVideoElement>) => {
    if (!event.currentTarget.muted) {
      onVideoPreviewUnmuted();
    }
  }, [onVideoPreviewUnmuted]);

  return (
    <div className="preview-content">
      {!hasSelectedEntry ? <p className="text-sm text-slate-500 dark:text-slate-400">Select an entry to render preview.</p> : null}
      {hasSelectedEntry && (preview?.preview_kind === "image" || preview?.preview_kind === "video") ? (
        <div className="inspector-media-wrapper">
          {onOpenFullScreen ? (
            <button
              type="button"
              className="preview-fullscreen-btn"
              onClick={onOpenFullScreen}
              aria-label="Open full screen"
              title="Full Screen"
            >
              <Maximize2 className="h-4 w-4" />
            </button>
          ) : null}
          {preview.preview_kind === "image" ? (
            <img
              src={
                animatedImageSource ??
                (preview.thumbnail_url
                  ? resolveApiUrl(preview.thumbnail_url)
                  : getThumbnailUrl(selectedEntry.id, { kind: "preview", fit: "contain" }))
              }
              alt={selectedEntry.filename}
              className="inspector-image"
            />
          ) : (
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
              className="inspector-video"
            />
          )}
        </div>
      ) : null}
      {hasSelectedEntry && preview?.preview_kind === "audio" ? (
        <audio src={getMediaUrl(selectedEntry.id)} controls className="w-full" />
      ) : null}
      {hasSelectedEntry && preview?.preview_kind === "text" ? (
        <pre className="inspector-text-preview">{preview.text_excerpt || "(empty text)"}</pre>
      ) : null}
      {hasSelectedEntry && preview && (preview.preview_kind === "binary" || preview.preview_kind === "missing") ? (
        <p className="text-sm text-slate-500">
          {preview.preview_kind === "missing" ? preview.text_excerpt : "Preview not available for this file type."}
        </p>
      ) : null}
    </div>
  );
}

export type MetadataContentProps = {
  selectedEntry: EntryResponse | null;
  selectedEntryIds: number[];
  selectedEntries: EntrySummaryResponse[];
  fieldDrafts: Record<string, string>;
  newFieldKey: string;
  newFieldValue: string;
  allTags: TagResponse[];
  fieldTypes: FieldTypeResponse[];
  tagMutationPending: boolean;
  tagEditPending: boolean;
  updateFieldPending: boolean;
  canPasteTags: boolean;
  onAddTagToEntries: (entryIds: number[], tagId: number) => Promise<void>;
  onPasteTagsToEntries: (entryIds: number[]) => void;
  onRemoveTagFromEntries: (entryIds: number[], tagId: number) => Promise<void>;
  onCreateTag: (payload: TagCreatePayload) => Promise<TagResponse | null>;
  onUpdateTag: (tagId: number, payload: TagUpdatePayload) => Promise<TagResponse | null>;
  onRefreshSelection: () => Promise<void>;
  onFieldDraftChange: (fieldKey: string, value: string) => void;
  onSaveField: (fieldKey: string, value: string) => void;
  onNewFieldKeyChange: (value: string) => void;
  onNewFieldValueChange: (value: string) => void;
  onApplyField: () => void;
  openAddTagsRequestNonce: number;
  isAddTagsOpen?: boolean;
  onAddTagsOpenChange?: (open: boolean) => void;
};

export function MetadataContent({
  selectedEntry,
  selectedEntryIds,
  selectedEntries,
  fieldDrafts,
  newFieldKey,
  newFieldValue,
  allTags,
  fieldTypes,
  tagMutationPending,
  tagEditPending,
  updateFieldPending,
  canPasteTags,
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
  openAddTagsRequestNonce,
  isAddTagsOpen,
  onAddTagsOpenChange
}: MetadataContentProps) {
  const [internalAddTagsOpen, setInternalAddTagsOpen] = useState(false);
  const isControlledAddTags = isAddTagsOpen !== undefined;
  const effectiveAddTagsOpen = isControlledAddTags ? isAddTagsOpen : internalAddTagsOpen;

  const setEffectiveAddTagsOpen = useCallback(
    (nextOpen: boolean) => {
      if (onAddTagsOpenChange) {
        onAddTagsOpenChange(nextOpen);
      }
      if (!isControlledAddTags) {
        setInternalAddTagsOpen(nextOpen);
      }
    },
    [isControlledAddTags, onAddTagsOpenChange]
  );

  const [editTag, setEditTag] = useState<TagResponse | null>(null);
  const [hoveredTagId, setHoveredTagId] = useState<number | null>(null);
  const [tagsOpen, setTagsOpen] = useState(true);
  const [inheritedTagsOpen, setInheritedTagsOpen] = useState(true);
  const [suggestedTagsOpen, setSuggestedTagsOpen] = useState(true);
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const [showAddField, setShowAddField] = useState(false);
  const previousOpenAddTagsRequestNonce = useRef(openAddTagsRequestNonce);

  const selectedCount = selectedEntryIds.length;
  const tagColorsQuery = useTagColors(selectedCount > 0);

  useEffect(() => {
    if (openAddTagsRequestNonce > previousOpenAddTagsRequestNonce.current && selectedCount > 0) {
      setEffectiveAddTagsOpen(true);
    }
    previousOpenAddTagsRequestNonce.current = openAddTagsRequestNonce;
  }, [openAddTagsRequestNonce, selectedCount, setEffectiveAddTagsOpen]);

  const tagById = useMemo(() => {
    const map = new Map<number, TagResponse>();
    for (const tag of allTags) {
      map.set(tag.id, tag);
    }
    for (const tag of selectedEntry?.tags ?? []) {
      if (!map.has(tag.id)) {
        map.set(tag.id, tag);
      }
    }
    return map;
  }, [allTags, selectedEntry]);

  const { ancestorMap } = useMemo(() => buildTagAncestryMap(allTags), [allTags]);

  const selectedEntriesForMetadata = useMemo(() => {
    if (!selectedEntry) {
      return selectedEntries;
    }

    if (!selectedEntryIds.includes(selectedEntry.id)) {
      return selectedEntries;
    }

    const selectedEntrySummary = {
      id: selectedEntry.id,
      path: selectedEntry.path,
      filename: selectedEntry.filename,
      suffix: selectedEntry.suffix,
      tag_ids: selectedEntry.tags.map((tag) => tag.id)
    };

    const otherSelectedEntries = selectedEntries.filter((entry) => entry.id !== selectedEntry.id);

    return [
      ...otherSelectedEntries,
      selectedEntrySummary
    ];
  }, [selectedEntries, selectedEntry, selectedEntryIds]);

  const entryTagIdsByEntry = useMemo(() => {
    const map = new Map<number, Set<number>>();
    for (const entry of selectedEntriesForMetadata) {
      map.set(entry.id, new Set(entry.tag_ids));
    }
    return map;
  }, [selectedEntriesForMetadata]);

  const tagDisplayContext = useMemo(() => createTagDisplayContext([...tagById.values()]), [tagById]);

  const aggregateTagRows = useMemo<AggregateTagRow[]>(() => {
    const counts = new Map<number, number>();
    for (const entry of selectedEntriesForMetadata) {
      for (const tagId of entry.tag_ids) {
        counts.set(tagId, (counts.get(tagId) ?? 0) + 1);
      }
    }

    const rows: AggregateTagRow[] = [];
    for (const [tagId, count] of counts.entries()) {
      rows.push({
        tagId,
        count,
        state: count === selectedCount ? "all" : "partial",
        tag: tagById.get(tagId) ?? null
      });
    }

    rows.sort((a, b) => {
      const aName = a.tag ? getTagDisplayLabel(a.tag, tagDisplayContext) : String(a.tagId);
      const bName = b.tag ? getTagDisplayLabel(b.tag, tagDisplayContext) : String(b.tagId);
      return aName.localeCompare(bName);
    });

    return rows;
  }, [selectedCount, selectedEntriesForMetadata, tagById, tagDisplayContext]);

  const inheritedTagRows = useMemo<InheritedTagRow[]>(() => {
    return computeInheritedTagRows({
      selectedEntries: selectedEntriesForMetadata,
      tagById,
      ancestorMap,
      tagDisplayContext,
      selectedCount
    });
  }, [ancestorMap, selectedCount, selectedEntriesForMetadata, tagById, tagDisplayContext]);

  const highlightedTagIds = useMemo(() => {
    if (hoveredTagId === null) {
      return new Set<number>();
    }
    const set = new Set<number>();
    const inheritedRow = inheritedTagRows.find((r) => r.tagId === hoveredTagId);
    if (inheritedRow) {
      for (const descId of inheritedRow.descendantTagIds) {
        set.add(descId);
      }
      return set;
    }
    const ancestors = ancestorMap.get(hoveredTagId);
    if (ancestors) {
      for (const ancId of ancestors) {
        set.add(ancId);
      }
    }
    return set;
  }, [ancestorMap, hoveredTagId, inheritedTagRows]);

  const tagColorLookup = useMemo(() => createTagColorLookup(tagColorsQuery.data), [tagColorsQuery.data]);

  const directTagIds = useMemo(() => {
    const set = new Set<number>();
    for (const entry of selectedEntriesForMetadata) {
      for (const tagId of entry.tag_ids) {
        set.add(tagId);
      }
    }
    return Array.from(set);
  }, [selectedEntriesForMetadata]);

  const inheritedTagIds = useMemo(() => {
    return inheritedTagRows.map((r) => r.tagId);
  }, [inheritedTagRows]);

  const nonContentTagIds = useMemo(() => {
    return allTags
      .filter((tag) => tag.is_category || tag.is_hidden || (tag.tag_type ?? "content") !== "content")
      .map((tag) => tag.id);
  }, [allTags]);

  const directContentTagIds = useMemo(() => {
    const nonContentSet = new Set(nonContentTagIds);
    return directTagIds.filter((id) => !nonContentSet.has(id));
  }, [directTagIds, nonContentTagIds]);

  const suggestedTagsQuery = useSuggestedTags({
    tagIds: directContentTagIds,
    excludeTagIds: [...directTagIds, ...inheritedTagIds, ...nonContentTagIds],
    limit: 12,
    enabled: selectedCount > 0 && directContentTagIds.length > 0
  });

  const suggestedTags = useMemo(() => {
    const raw = suggestedTagsQuery.data ?? [];
    if (nonContentTagIds.length === 0) {
      return raw;
    }
    const nonContentSet = new Set(nonContentTagIds);
    return raw.filter((item) => !nonContentSet.has(item.tag.id));
  }, [suggestedTagsQuery.data, nonContentTagIds]);

  const removeTag = useCallback(async (tagId: number) => {
    await onRemoveTagFromEntries(selectedEntryIds, tagId);
    await onRefreshSelection();
  }, [onRefreshSelection, onRemoveTagFromEntries, selectedEntryIds]);

  const addSuggestedTag = useCallback(
    async (tagId: number) => {
      await onAddTagToEntries(selectedEntryIds, tagId);
      await onRefreshSelection();
    },
    [onAddTagToEntries, onRefreshSelection, selectedEntryIds]
  );

  if (selectedCount === 0) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">Select one or more entries to inspect metadata.</p>;
  }

  const singleSelection = selectedCount === 1;

  return (
    <div className="metadata-content space-y-3 text-sm">
      <div>
        <strong>Selection:</strong>{" "}
        {singleSelection && selectedEntry
          ? selectedEntry.path
          : `${selectedCount} entries selected`}
      </div>

      <div className="metadata-collapsible-section">
        <div className="metadata-section-header">
          <button
            type="button"
            className="metadata-section-toggle"
            onClick={() => setTagsOpen((prev) => !prev)}
            aria-expanded={tagsOpen}
          >
            {tagsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <strong>Tags</strong>
            {aggregateTagRows.length > 0 ? (
              <span className="metadata-section-count">({aggregateTagRows.length})</span>
            ) : null}
          </button>
          <div className="metadata-tag-actions-buttons">
            {canPasteTags ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => onPasteTagsToEntries(selectedEntryIds)}
                disabled={tagMutationPending}
              >
                Paste Tags
              </Button>
            ) : null}
            <Button size="sm" onClick={() => setEffectiveAddTagsOpen(true)} disabled={tagMutationPending}>
              Add Tag
            </Button>
          </div>
        </div>

        {tagsOpen ? (
          <div className="metadata-tag-list" role="list" aria-label="Direct tags">
            {aggregateTagRows.length === 0 ? (
              <p className="tag-editor-empty">No tags applied.</p>
            ) : (
              aggregateTagRows.map((row) => {
                const isHighlighted = highlightedTagIds.has(row.tagId);
                return (
                  <div
                    key={row.tagId}
                    className={`metadata-tag-chip ${isHighlighted ? "metadata-tag-chip-highlighted" : ""}`}
                    style={row.tag ? resolveTagChipStyle(row.tag, tagColorLookup) : undefined}
                    onMouseEnter={() => setHoveredTagId(row.tagId)}
                    onMouseLeave={() => setHoveredTagId(null)}
                  >
                    <button
                      type="button"
                      className="metadata-tag-chip-main"
                      onClick={() => {
                        if (row.tag) {
                          setEditTag(row.tag);
                        }
                      }}
                      onFocus={() => setHoveredTagId(row.tagId)}
                      onBlur={() => setHoveredTagId(null)}
                      disabled={!row.tag || tagEditPending}
                    >
                      <span className="metadata-tag-chip-label">
                        {row.tag ? getTagDisplayLabel(row.tag, tagDisplayContext) : `Tag #${row.tagId}`}
                      </span>
                      {row.state === "partial" ? <span className="metadata-tag-partial">Partial</span> : null}
                    </button>
                    <div className="metadata-tag-chip-remove-slot">
                      <button
                        type="button"
                        className="metadata-tag-chip-remove"
                        aria-label={`Remove ${row.tag ? getTagDisplayLabel(row.tag, tagDisplayContext) : `Tag #${row.tagId}`}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          void removeTag(row.tagId);
                        }}
                        disabled={tagMutationPending}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ) : null}
      </div>

      <div className="metadata-collapsible-section">
        <div className="metadata-section-header">
          <button
            type="button"
            className="metadata-section-toggle"
            onClick={() => setInheritedTagsOpen((prev) => !prev)}
            aria-expanded={inheritedTagsOpen}
          >
            {inheritedTagsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <strong>Inherited tags</strong>
            {inheritedTagRows.length > 0 ? (
              <span className="metadata-section-count">({inheritedTagRows.length})</span>
            ) : null}
          </button>
        </div>

        {inheritedTagsOpen ? (
          inheritedTagRows.length === 0 ? (
            <p className="tag-editor-empty">No inherited tags.</p>
          ) : (
            <div className="metadata-tag-list" role="list" aria-label="Inherited tags">
              {inheritedTagRows.map((row) => {
                const isHighlighted = highlightedTagIds.has(row.tagId);
                const descendantNames = row.descendantTagIds
                  .map((id) => {
                    const tag = tagById.get(id);
                    return tag ? getTagDisplayLabel(tag, tagDisplayContext) : `#${id}`;
                  })
                  .join(", ");
                const inheritedTitle = descendantNames
                  ? `Inherited from: ${descendantNames}`
                  : "Inherited tag";

                return (
                  <div
                    key={row.tagId}
                    className={`metadata-tag-chip metadata-tag-chip-inherited ${isHighlighted ? "metadata-tag-chip-highlighted" : ""}`}
                    style={row.tag ? resolveTagChipStyle(row.tag, tagColorLookup) : undefined}
                    onMouseEnter={() => setHoveredTagId(row.tagId)}
                    onMouseLeave={() => setHoveredTagId(null)}
                  >
                    <button
                      type="button"
                      className="metadata-tag-chip-main"
                      onClick={() => {
                        if (row.tag) {
                          setEditTag(row.tag);
                        }
                      }}
                      onFocus={() => setHoveredTagId(row.tagId)}
                      onBlur={() => setHoveredTagId(null)}
                      disabled={!row.tag || tagEditPending}
                      title={inheritedTitle}
                    >
                      <span className="metadata-tag-chip-label">
                        {row.tag ? getTagDisplayLabel(row.tag, tagDisplayContext) : `Tag #${row.tagId}`}
                      </span>
                      {row.state === "partial" ? <span className="metadata-tag-partial">Partial</span> : null}
                    </button>
                  </div>
                );
              })}
            </div>
          )
        ) : null}
      </div>

      {suggestedTags.length > 0 ? (
        <div className="metadata-collapsible-section">
          <div className="metadata-section-header">
            <button
              type="button"
              className="metadata-section-toggle"
              onClick={() => setSuggestedTagsOpen((prev) => !prev)}
              aria-expanded={suggestedTagsOpen}
            >
              {suggestedTagsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <strong>Suggested tags</strong>
              <span className="metadata-section-count">({suggestedTags.length})</span>
            </button>
          </div>

          {suggestedTagsOpen ? (
            <div className="metadata-tag-list" role="list" aria-label="Suggested tags">
              {suggestedTags.map((suggestion) => {
                const isHighlighted = highlightedTagIds.has(suggestion.tag.id);
                const label = getTagDisplayLabel(suggestion.tag, tagDisplayContext);
                const title = formatSuggestedTagTooltip(label, suggestion.confidence);

                return (
                  <div
                    key={suggestion.tag.id}
                    className={`metadata-tag-chip metadata-tag-chip-suggested ${isHighlighted ? "metadata-tag-chip-highlighted" : ""}`}
                    style={resolveTagChipStyle(suggestion.tag, tagColorLookup)}
                    onMouseEnter={() => setHoveredTagId(suggestion.tag.id)}
                    onMouseLeave={() => setHoveredTagId(null)}
                  >
                    <button
                      type="button"
                      className="metadata-tag-chip-main"
                      onClick={() => void addSuggestedTag(suggestion.tag.id)}
                      onFocus={() => setHoveredTagId(suggestion.tag.id)}
                      onBlur={() => setHoveredTagId(null)}
                      disabled={tagMutationPending}
                      title={title}
                    >
                      <span className="metadata-tag-chip-label">{label}</span>
                    </button>
                    <div className="metadata-tag-chip-add-slot">
                      <button
                        type="button"
                        className="metadata-tag-chip-add"
                        aria-label={`Add tag ${label}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          void addSuggestedTag(suggestion.tag.id);
                        }}
                        disabled={tagMutationPending}
                        title={title}
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="metadata-collapsible-section">
        <div className="metadata-section-header">
          <button
            type="button"
            className="metadata-section-toggle"
            onClick={() => setFieldsOpen((prev) => !prev)}
            aria-expanded={fieldsOpen}
          >
            {fieldsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <strong>Fields</strong>
            {singleSelection && selectedEntry && selectedEntry.fields.length > 0 ? (
              <span className="metadata-section-count">({selectedEntry.fields.length})</span>
            ) : null}
          </button>
          {singleSelection && selectedEntry && fieldsOpen ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setShowAddField((prev) => !prev)}
            >
              {showAddField ? "Cancel" : "Add Field"}
            </Button>
          ) : null}
        </div>

        {fieldsOpen ? (
          singleSelection && selectedEntry ? (
            <div className="space-y-3">
              {selectedEntry.fields.length === 0 && !showAddField ? (
                <p className="tag-editor-empty">No fields applied.</p>
              ) : selectedEntry.fields.length > 0 ? (
                <ul className="m-0 list-none space-y-2 p-0">
                  {selectedEntry.fields.map((field) => (
                    <li key={field.id}>
                      <div className="mb-1 font-medium">{field.type_name}</div>
                      <div className="flex gap-2">
                        <input
                          className="min-w-0 flex-1 rounded-xl border border-[var(--color-border-soft)] bg-white/95 px-2 py-1 text-sm dark:bg-slate-800/95 dark:text-slate-100"
                          value={fieldDrafts[field.type_key] ?? ""}
                          onChange={(event) => onFieldDraftChange(field.type_key, event.target.value)}
                        />
                        <Button
                          variant="secondary"
                          disabled={updateFieldPending}
                          onClick={() => onSaveField(field.type_key, fieldDrafts[field.type_key] ?? "")}
                        >
                          Save
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}

              {showAddField ? (
                <div className="space-y-1 rounded-xl border border-[var(--color-border-soft)] p-2.5 bg-slate-50/50 dark:bg-slate-900/40">
                  <strong className="text-xs font-semibold text-slate-600 dark:text-slate-300">Add/Update Field</strong>
                  <div className="flex gap-2">
                    <select
                      className="rounded-xl border border-[var(--color-border-soft)] bg-white/95 px-2 py-1 text-sm dark:bg-slate-800/95 dark:text-slate-100"
                      value={newFieldKey}
                      onChange={(event) => onNewFieldKeyChange(event.target.value)}
                    >
                      <option value="">Select field type</option>
                      {fieldTypes.map((fieldType) => (
                        <option key={fieldType.key} value={fieldType.key}>
                          {fieldType.name}
                        </option>
                      ))}
                    </select>
                    <input
                      className="min-w-0 flex-1 rounded-xl border border-[var(--color-border-soft)] bg-white/95 px-2 py-1 text-sm dark:bg-slate-800/95 dark:text-slate-100"
                      value={newFieldValue}
                      onChange={(event) => onNewFieldValueChange(event.target.value)}
                      placeholder="Field value"
                    />
                    <Button variant="secondary" disabled={!newFieldKey || updateFieldPending} onClick={onApplyField}>
                      Apply
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Field editing is available when a single entry is selected.
            </p>
          )
        ) : null}
      </div>

      <AddTagsModal
        open={effectiveAddTagsOpen}
        allTags={allTags}
        selectedEntryIds={selectedEntryIds}
        entryTagIdsByEntry={entryTagIdsByEntry}
        onClose={() => {
          setEffectiveAddTagsOpen(false);
          void onRefreshSelection();
        }}
        onAddTagToEntries={onAddTagToEntries}
        onCreateTag={onCreateTag}
        onUpdateTag={onUpdateTag}
        onAfterTagChanged={onRefreshSelection}
      />

      <TagEditorModal
        open={editTag !== null}
        mode="edit"
        tag={editTag}
        onClose={() => setEditTag(null)}
        onCreate={onCreateTag}
        onUpdate={onUpdateTag}
        onSaved={() => {
          void onRefreshSelection();
        }}
      />
    </div>
  );
}

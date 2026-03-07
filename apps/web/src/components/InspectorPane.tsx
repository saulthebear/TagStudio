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
import { useCallback, useMemo, useState } from "react";

import { AddTagsModal } from "@/components/AddTagsModal";
import { SplitPane, type SplitPaneState } from "@/components/SplitPane";
import { TagEditorModal } from "@/components/TagEditorModal";

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
  onAddTagToEntries: (entryIds: number[], tagId: number) => Promise<void>;
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
  onAddTagToEntries,
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
  mobileSection
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
      />
    </div>
  );

  const metadataSection = (
    <div className="inspector-section inspector-meta-section">
      <h2 className="panel-title m-0">Metadata</h2>
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
        onAddTagToEntries={onAddTagToEntries}
        onRemoveTagFromEntries={onRemoveTagFromEntries}
        onCreateTag={onCreateTag}
        onUpdateTag={onUpdateTag}
        onRefreshSelection={onRefreshSelection}
        onFieldDraftChange={onFieldDraftChange}
        onSaveField={onSaveField}
        onNewFieldKeyChange={onNewFieldKeyChange}
        onNewFieldValueChange={onNewFieldValueChange}
        onApplyField={onApplyField}
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
        railSize={26}
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
};

function PreviewContent({
  selectedEntry,
  preview,
  getMediaUrl,
  getThumbnailUrl,
  resolveApiUrl
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

  return (
    <div className="preview-content">
      {!hasSelectedEntry ? <p className="text-sm text-slate-500">Select an entry to render preview.</p> : null}
      {hasSelectedEntry && preview?.preview_kind === "image" ? (
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
      ) : null}
      {hasSelectedEntry && preview?.preview_kind === "video" ? (
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
          muted={true}
          playsInline
          controls
          className="inspector-video"
        />
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

type MetadataContentProps = {
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
  onAddTagToEntries: (entryIds: number[], tagId: number) => Promise<void>;
  onRemoveTagFromEntries: (entryIds: number[], tagId: number) => Promise<void>;
  onCreateTag: (payload: TagCreatePayload) => Promise<TagResponse | null>;
  onUpdateTag: (tagId: number, payload: TagUpdatePayload) => Promise<TagResponse | null>;
  onRefreshSelection: () => Promise<void>;
  onFieldDraftChange: (fieldKey: string, value: string) => void;
  onSaveField: (fieldKey: string, value: string) => void;
  onNewFieldKeyChange: (value: string) => void;
  onNewFieldValueChange: (value: string) => void;
  onApplyField: () => void;
};

function MetadataContent({
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
  onAddTagToEntries,
  onRemoveTagFromEntries,
  onCreateTag,
  onUpdateTag,
  onRefreshSelection,
  onFieldDraftChange,
  onSaveField,
  onNewFieldKeyChange,
  onNewFieldValueChange,
  onApplyField
}: MetadataContentProps) {
  const [addTagsOpen, setAddTagsOpen] = useState(false);
  const [editTag, setEditTag] = useState<TagResponse | null>(null);

  const selectedCount = selectedEntryIds.length;

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
      const aName = a.tag?.name ?? String(a.tagId);
      const bName = b.tag?.name ?? String(b.tagId);
      return aName.localeCompare(bName);
    });

    return rows;
  }, [selectedCount, selectedEntriesForMetadata, tagById]);

  const removeTag = useCallback(async (tagId: number) => {
    await onRemoveTagFromEntries(selectedEntryIds, tagId);
    await onRefreshSelection();
  }, [onRefreshSelection, onRemoveTagFromEntries, selectedEntryIds]);

  if (selectedCount === 0) {
    return <p className="text-sm text-slate-500">Select one or more entries to inspect metadata.</p>;
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

      <div className="metadata-tag-actions">
        <div className="metadata-tag-actions-header">
          <strong>Tags</strong>
          <Button size="sm" onClick={() => setAddTagsOpen(true)} disabled={tagMutationPending}>
            Add Tag
          </Button>
        </div>

        <div className="metadata-tag-list">
          {aggregateTagRows.length === 0 ? (
            <p className="tag-editor-empty">No tags applied.</p>
          ) : (
            aggregateTagRows.map((row) => (
              <div key={row.tagId} className="metadata-tag-chip">
                <button
                  type="button"
                  className="metadata-tag-chip-main"
                  onClick={() => {
                    if (row.tag) {
                      setEditTag(row.tag);
                    }
                  }}
                  disabled={!row.tag || tagEditPending}
                >
                  <span className="metadata-tag-chip-label">{row.tag?.name ?? `Tag #${row.tagId}`}</span>
                  {row.state === "partial" ? <span className="metadata-tag-partial">Partial</span> : null}
                </button>
                <button
                  type="button"
                  className="metadata-tag-chip-remove"
                  aria-label={`Remove ${row.tag?.name ?? `Tag #${row.tagId}`}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    void removeTag(row.tagId);
                  }}
                  disabled={tagMutationPending}
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {singleSelection && selectedEntry ? (
        <>
          <div>
            <strong>Fields</strong>
            <ul className="m-0 mt-1 list-none space-y-2 p-0">
              {selectedEntry.fields.map((field) => (
                <li key={field.id}>
                  <div className="mb-1 font-medium">{field.type_name}</div>
                  <div className="flex gap-2">
                    <input
                      className="min-w-0 flex-1 rounded-xl border border-[var(--color-border-soft)] bg-white/95 px-2 py-1 text-sm"
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
          </div>
          <div className="space-y-1">
            <strong>Add/Update Field</strong>
            <div className="flex gap-2">
              <select
                className="rounded-xl border border-[var(--color-border-soft)] bg-white/95 px-2 py-1 text-sm"
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
                className="min-w-0 flex-1 rounded-xl border border-[var(--color-border-soft)] bg-white/95 px-2 py-1 text-sm"
                value={newFieldValue}
                onChange={(event) => onNewFieldValueChange(event.target.value)}
                placeholder="Field value"
              />
              <Button variant="secondary" disabled={!newFieldKey || updateFieldPending} onClick={onApplyField}>
                Apply
              </Button>
            </div>
          </div>
        </>
      ) : (
        <p className="text-sm text-slate-500">Field editing is available when a single entry is selected.</p>
      )}

      <AddTagsModal
        open={addTagsOpen}
        selectedEntryIds={selectedEntryIds}
        entryTagIdsByEntry={entryTagIdsByEntry}
        onClose={() => {
          setAddTagsOpen(false);
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

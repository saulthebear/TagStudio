import {
  type EntryResponse,
  type FieldTypeResponse,
  type PreviewResponse,
  type TagResponse
} from "@tagstudio/api-client";
import { Button } from "@tagstudio/ui";

import { SplitPane, type SplitPaneState } from "@/components/SplitPane";

type InspectorPaneProps = {
  selectedEntry: EntryResponse | null;
  preview: PreviewResponse | undefined;
  getMediaUrl: (entryId: number) => string;
  tagsDisplay: string;
  tagQuery: string;
  selectedTagId: string;
  fieldDrafts: Record<string, string>;
  newFieldKey: string;
  newFieldValue: string;
  availableTags: TagResponse[];
  fieldTypes: FieldTypeResponse[];
  addTagPending: boolean;
  updateFieldPending: boolean;
  onTagQueryChange: (value: string) => void;
  onSelectedTagChange: (value: string) => void;
  onAddTag: () => void;
  onRemoveTag: (tagId: number) => void;
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

export function InspectorPane({
  selectedEntry,
  preview,
  getMediaUrl,
  tagsDisplay,
  tagQuery,
  selectedTagId,
  fieldDrafts,
  newFieldKey,
  newFieldValue,
  availableTags,
  fieldTypes,
  addTagPending,
  updateFieldPending,
  onTagQueryChange,
  onSelectedTagChange,
  onAddTag,
  onRemoveTag,
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
      />
    </div>
  );

  const metadataSection = (
    <div className="inspector-section inspector-meta-section">
      <h2 className="panel-title m-0">Metadata</h2>
      <MetadataContent
        selectedEntry={selectedEntry}
        tagsDisplay={tagsDisplay}
        tagQuery={tagQuery}
        selectedTagId={selectedTagId}
        fieldDrafts={fieldDrafts}
        newFieldKey={newFieldKey}
        newFieldValue={newFieldValue}
        availableTags={availableTags}
        fieldTypes={fieldTypes}
        addTagPending={addTagPending}
        updateFieldPending={updateFieldPending}
        onTagQueryChange={onTagQueryChange}
        onSelectedTagChange={onSelectedTagChange}
        onAddTag={onAddTag}
        onRemoveTag={onRemoveTag}
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
};

function PreviewContent({
  selectedEntry,
  preview,
  getMediaUrl
}: PreviewContentProps) {
  const hasSelectedEntry = selectedEntry !== null;

  return (
    <div className="preview-content">
      {!hasSelectedEntry ? <p className="text-sm text-slate-500">Select an entry to render preview.</p> : null}
      {hasSelectedEntry && preview?.preview_kind === "image" ? (
        <img
          src={getMediaUrl(selectedEntry.id)}
          alt={selectedEntry.filename}
          className="inspector-image"
        />
      ) : null}
      {hasSelectedEntry && preview?.preview_kind === "video" ? (
        <video src={getMediaUrl(selectedEntry.id)} controls className="inspector-video" />
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
  tagsDisplay: string;
  tagQuery: string;
  selectedTagId: string;
  fieldDrafts: Record<string, string>;
  newFieldKey: string;
  newFieldValue: string;
  availableTags: TagResponse[];
  fieldTypes: FieldTypeResponse[];
  addTagPending: boolean;
  updateFieldPending: boolean;
  onTagQueryChange: (value: string) => void;
  onSelectedTagChange: (value: string) => void;
  onAddTag: () => void;
  onRemoveTag: (tagId: number) => void;
  onFieldDraftChange: (fieldKey: string, value: string) => void;
  onSaveField: (fieldKey: string, value: string) => void;
  onNewFieldKeyChange: (value: string) => void;
  onNewFieldValueChange: (value: string) => void;
  onApplyField: () => void;
};

function MetadataContent({
  selectedEntry,
  tagsDisplay,
  tagQuery,
  selectedTagId,
  fieldDrafts,
  newFieldKey,
  newFieldValue,
  availableTags,
  fieldTypes,
  addTagPending,
  updateFieldPending,
  onTagQueryChange,
  onSelectedTagChange,
  onAddTag,
  onRemoveTag,
  onFieldDraftChange,
  onSaveField,
  onNewFieldKeyChange,
  onNewFieldValueChange,
  onApplyField
}: MetadataContentProps) {
  if (!selectedEntry) {
    return <p className="text-sm text-slate-500">Select an entry to inspect tags and fields.</p>;
  }

  return (
    <div className="metadata-content space-y-3 text-sm">
      <div>
        <strong>Path:</strong> {selectedEntry.path}
      </div>
      <div>
        <strong>Tags:</strong> {tagsDisplay || "none"}
      </div>
      <div className="space-y-2">
        <strong>Tag Actions</strong>
        <div className="flex gap-2">
          <input
            className="w-full rounded-xl border border-[var(--color-border-soft)] bg-white/95 px-2 py-1 text-sm"
            placeholder="Filter tags..."
            value={tagQuery}
            onChange={(event) => onTagQueryChange(event.target.value)}
          />
          <select
            className="max-w-56 rounded-xl border border-[var(--color-border-soft)] bg-white/95 px-2 py-1 text-sm"
            value={selectedTagId}
            onChange={(event) => onSelectedTagChange(event.target.value)}
          >
            <option value="">Select tag</option>
            {availableTags.map((tag) => (
              <option key={tag.id} value={String(tag.id)}>
                {tag.name}
              </option>
            ))}
          </select>
          <Button variant="secondary" disabled={!selectedTagId || addTagPending} onClick={onAddTag}>
            Add
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {selectedEntry.tags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              className="rounded-xl border border-[var(--color-border-soft)] px-2 py-1 text-xs"
              onClick={() => onRemoveTag(tag.id)}
            >
              Remove {tag.name}
            </button>
          ))}
        </div>
      </div>
      <div>
        <strong>Fields</strong>
        <ul className="m-0 mt-1 list-none space-y-2 p-0">
          {selectedEntry.fields.map((field) => (
            <li key={field.id}>
              <div className="mb-1 font-medium">{field.type_name}</div>
              <div className="flex gap-2">
                <input
                  className="w-full rounded-xl border border-[var(--color-border-soft)] bg-white/95 px-2 py-1 text-sm"
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
            className="w-full rounded-xl border border-[var(--color-border-soft)] bg-white/95 px-2 py-1 text-sm"
            value={newFieldValue}
            onChange={(event) => onNewFieldValueChange(event.target.value)}
            placeholder="Field value"
          />
          <Button variant="secondary" disabled={!newFieldKey || updateFieldPending} onClick={onApplyField}>
            Apply
          </Button>
        </div>
      </div>
    </div>
  );
}

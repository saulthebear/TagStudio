import {
  type TagColorNamespaceResponse,
  type TagCreatePayload,
  type TagResponse,
  type TagUpdatePayload
} from "@tagstudio/api-client";
import { Button } from "@tagstudio/ui";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { api } from "@/api/client";

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

function toUniqueAliases(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function findColorName(
  groups: TagColorNamespaceResponse[] | undefined,
  namespace: string | null,
  slug: string | null
): string {
  if (!namespace || !slug || !groups) {
    return "No Color";
  }

  for (const group of groups) {
    if (group.namespace !== namespace) {
      continue;
    }

    for (const color of group.colors) {
      if (color.slug === slug) {
        return `${group.namespace_name}: ${color.name}`;
      }
    }
  }

  return "No Color";
}

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
  const [name, setName] = useState("");
  const [shorthand, setShorthand] = useState("");
  const [aliases, setAliases] = useState<string[]>([]);
  const [parentIds, setParentIds] = useState<number[]>([]);
  const [disambiguationId, setDisambiguationId] = useState<number | null>(null);
  const [colorNamespace, setColorNamespace] = useState<string | null>(null);
  const [colorSlug, setColorSlug] = useState<string | null>(null);
  const [isCategory, setIsCategory] = useState(false);
  const [isHidden, setIsHidden] = useState(false);

  const [parentPickerOpen, setParentPickerOpen] = useState(false);
  const [parentQuery, setParentQuery] = useState("");
  const [parentLimit, setParentLimit] = useState(25);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [savePending, setSavePending] = useState(false);

  const allTagsQuery = useQuery({
    queryKey: ["tag-editor-all-tags"],
    queryFn: () => api.getTags(undefined, -1),
    enabled: open
  });

  const parentCandidatesQuery = useQuery({
    queryKey: ["tag-editor-parent-candidates", tag?.id ?? "new", parentQuery, parentLimit],
    queryFn: () => api.getTags(parentQuery, parentLimit, tag?.id),
    enabled: open && parentPickerOpen
  });

  const tagColorsQuery = useQuery({
    queryKey: ["tag-colors"],
    queryFn: () => api.getTagColors(),
    enabled: open
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    setName(mode === "create" ? (initialName ?? "") : (tag?.name ?? ""));
    setShorthand(mode === "create" ? "" : (tag?.shorthand ?? ""));
    setAliases(mode === "create" ? [] : [...(tag?.aliases ?? [])]);
    setParentIds(mode === "create" ? [] : [...(tag?.parent_ids ?? [])]);
    setDisambiguationId(mode === "create" ? null : (tag?.disambiguation_id ?? null));
    setColorNamespace(mode === "create" ? null : (tag?.color_namespace ?? null));
    setColorSlug(mode === "create" ? null : (tag?.color_slug ?? null));
    setIsCategory(mode === "create" ? false : (tag?.is_category ?? false));
    setIsHidden(mode === "create" ? false : (tag?.is_hidden ?? false));
    setParentPickerOpen(false);
    setParentQuery("");
    setParentLimit(25);
    setColorPickerOpen(false);
    setSavePending(false);
  }, [initialName, mode, open, tag]);

  const tagById = useMemo(() => {
    const map = new Map<number, TagResponse>();
    for (const item of allTagsQuery.data ?? []) {
      map.set(item.id, item);
    }
    return map;
  }, [allTagsQuery.data]);

  const disambiguationLabel = useMemo(() => {
    if (!disambiguationId) {
      return "";
    }
    const parent = tagById.get(disambiguationId);
    const display = parent?.shorthand || parent?.name || `#${disambiguationId}`;
    return `${name.trim() || "Tag"} (${display})`;
  }, [disambiguationId, name, tagById]);

  const colorLabel = useMemo(
    () => findColorName(tagColorsQuery.data, colorNamespace, colorSlug),
    [colorNamespace, colorSlug, tagColorsQuery.data]
  );

  if (!open) {
    return null;
  }

  const normalizedName = name.trim();
  const canSave = normalizedName.length > 0 && !savePending;

  const selectedParents = parentIds
    .map((id) => tagById.get(id))
    .filter((value): value is TagResponse => value !== undefined)
    .sort((a, b) => a.name.localeCompare(b.name));

  const removeParent = (parentId: number) => {
    setParentIds((prev) => prev.filter((id) => id !== parentId));
    setDisambiguationId((prev) => (prev === parentId ? null : prev));
  };

  const addAliasRow = () => {
    setAliases((prev) => [...prev, ""]);
  };

  const updateAlias = (index: number, nextValue: string) => {
    setAliases((prev) => prev.map((value, idx) => (idx === index ? nextValue : value)));
  };

  const removeAlias = (index: number) => {
    setAliases((prev) => prev.filter((_, idx) => idx !== index));
  };

  const saveTag = async () => {
    if (!canSave) {
      return;
    }

    const aliasValues = toUniqueAliases(aliases);
    const payload: TagCreatePayload = {
      name: normalizedName,
      shorthand: shorthand.trim() ? shorthand.trim() : null,
      aliases: aliasValues,
      parent_ids: [...parentIds],
      disambiguation_id: disambiguationId,
      color_namespace: colorNamespace,
      color_slug: colorSlug,
      is_category: isCategory,
      is_hidden: isHidden
    };

    setSavePending(true);
    try {
      const saved =
        mode === "create" || !tag
          ? await onCreate(payload)
          : await onUpdate(tag.id, {
              ...payload,
              aliases: payload.aliases,
              parent_ids: payload.parent_ids,
              is_category: payload.is_category,
              is_hidden: payload.is_hidden
            });

      if (saved) {
        onSaved?.(saved);
        onClose();
      }
    } finally {
      setSavePending(false);
    }
  };

  return (
    <div className="overlay" role="presentation" onClick={onClose}>
      <div
        className="overlay-panel panel tag-editor-panel"
        role="dialog"
        aria-modal="true"
        aria-label={mode === "create" ? "Create tag" : "Edit tag"}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="panel-title m-0">{mode === "create" ? "New Tag" : "Edit Tag"}</h2>

        <label className="settings-row">
          <span>Name</span>
          <input
            className="input-base"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Tag name"
          />
        </label>

        <label className="settings-row">
          <span>Shorthand</span>
          <input
            className="input-base"
            value={shorthand}
            onChange={(event) => setShorthand(event.target.value)}
            placeholder="Optional shorthand"
          />
        </label>

        <div className="settings-row">
          <span>Aliases</span>
          <div className="tag-editor-aliases">
            {aliases.map((alias, index) => (
              <div key={`alias-${index}`} className="tag-editor-alias-row">
                <input
                  className="input-base"
                  value={alias}
                  onChange={(event) => updateAlias(index, event.target.value)}
                  placeholder="Alias"
                />
                <Button variant="secondary" size="sm" onClick={() => removeAlias(index)}>
                  -
                </Button>
              </div>
            ))}
            <Button variant="secondary" size="sm" onClick={addAliasRow}>
              + Add Alias
            </Button>
          </div>
        </div>

        <div className="settings-row">
          <span>Parent Tags</span>
          <div className="tag-editor-parent-list">
            {selectedParents.length === 0 ? (
              <p className="tag-editor-empty">No parent tags selected.</p>
            ) : (
              selectedParents.map((parent) => (
                <div key={parent.id} className="tag-editor-parent-pill">
                  <span>{parent.name}</span>
                  <Button variant="secondary" size="sm" onClick={() => removeParent(parent.id)}>
                    Remove
                  </Button>
                </div>
              ))
            )}
          </div>
          <Button variant="secondary" size="sm" onClick={() => setParentPickerOpen(true)}>
            Add Parent Tag(s)
          </Button>
        </div>

        <div className="settings-row">
          <span>Disambiguation Parent</span>
          <select
            className="input-base"
            value={disambiguationId ? String(disambiguationId) : ""}
            onChange={(event) => {
              const nextValue = event.target.value;
              setDisambiguationId(nextValue ? Number(nextValue) : null);
            }}
          >
            <option value="">None</option>
            {selectedParents.map((parent) => (
              <option key={parent.id} value={String(parent.id)}>
                {parent.name}
              </option>
            ))}
          </select>
          <p className="tag-editor-hint">
            This parent name is shown in the UI as <strong>TagName (ParentName)</strong>.
          </p>
          {disambiguationLabel ? <p className="tag-editor-preview">Preview: {disambiguationLabel}</p> : null}
        </div>

        <div className="settings-row">
          <span>Color</span>
          <Button variant="secondary" onClick={() => setColorPickerOpen(true)}>
            {colorLabel}
          </Button>
        </div>

        <div className="settings-row">
          <span>Properties</span>
          <label className="settings-checkbox">
            <input
              className="toggle-base"
              type="checkbox"
              checked={isCategory}
              onChange={(event) => setIsCategory(event.target.checked)}
            />
            <span>Is Category</span>
          </label>
          <label className="settings-checkbox">
            <input
              className="toggle-base"
              type="checkbox"
              checked={isHidden}
              onChange={(event) => setIsHidden(event.target.checked)}
            />
            <span>Is Hidden</span>
          </label>
        </div>

        <div className="overlay-panel-actions">
          <Button variant="secondary" onClick={onClose} disabled={savePending}>
            Cancel
          </Button>
          <Button onClick={saveTag} disabled={!canSave}>
            {savePending ? "Saving..." : "Save"}
          </Button>
        </div>

        {parentPickerOpen ? (
          <div className="overlay tag-editor-suboverlay" role="presentation" onClick={() => setParentPickerOpen(false)}>
            <div
              className="overlay-panel panel tag-editor-subpanel"
              role="dialog"
              aria-modal="true"
              aria-label="Add parent tags"
              onClick={(event) => event.stopPropagation()}
            >
              <h3 className="panel-title m-0">Add Parent Tag(s)</h3>
              <div className="tag-editor-parent-controls">
                <input
                  className="input-base"
                  placeholder="Search tags"
                  value={parentQuery}
                  onChange={(event) => setParentQuery(event.target.value)}
                />
                <select
                  className="input-base"
                  value={String(parentLimit)}
                  onChange={(event) => setParentLimit(Number(event.target.value))}
                >
                  {LIMIT_OPTIONS.map((option) => (
                    <option key={option.label} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="tag-editor-parent-candidates">
                {(parentCandidatesQuery.data ?? []).map((candidate) => {
                  const alreadyAdded = parentIds.includes(candidate.id);
                  return (
                    <button
                      key={candidate.id}
                      type="button"
                      className="tag-editor-candidate-row"
                      disabled={alreadyAdded}
                      onClick={() => {
                        setParentIds((prev) => [...prev, candidate.id]);
                        setParentPickerOpen(false);
                        setParentQuery("");
                      }}
                    >
                      <span>{candidate.name}</span>
                      <span>{alreadyAdded ? "Added" : "Add"}</span>
                    </button>
                  );
                })}
              </div>
              <div className="overlay-panel-actions">
                <Button variant="secondary" onClick={() => setParentPickerOpen(false)}>
                  Done
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {colorPickerOpen ? (
          <div className="overlay tag-editor-suboverlay" role="presentation" onClick={() => setColorPickerOpen(false)}>
            <div
              className="overlay-panel panel tag-editor-subpanel"
              role="dialog"
              aria-modal="true"
              aria-label="Choose tag color"
              onClick={(event) => event.stopPropagation()}
            >
              <h3 className="panel-title m-0">Choose Tag Color</h3>
              <div className="tag-editor-color-grid">
                <button
                  type="button"
                  className="tag-editor-color-row"
                  onClick={() => {
                    setColorNamespace(null);
                    setColorSlug(null);
                    setColorPickerOpen(false);
                  }}
                >
                  <span className="tag-editor-color-swatch" aria-hidden="true" />
                  <span>No Color</span>
                </button>
                {(tagColorsQuery.data ?? []).map((group) => (
                  <div key={group.namespace}>
                    <h4 className="tag-editor-color-title">{group.namespace_name}</h4>
                    {group.colors.map((color) => (
                      <button
                        key={`${group.namespace}/${color.slug}`}
                        type="button"
                        className="tag-editor-color-row"
                        title={`${group.namespace_name}: ${color.name}`}
                        aria-label={`${group.namespace_name}: ${color.name}`}
                        onClick={() => {
                          setColorNamespace(color.namespace);
                          setColorSlug(color.slug);
                          setColorPickerOpen(false);
                        }}
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
                <Button variant="secondary" onClick={() => setColorPickerOpen(false)}>
                  Done
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

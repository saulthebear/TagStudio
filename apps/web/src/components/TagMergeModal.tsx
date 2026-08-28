import { useMemo, useState, useEffect } from "react";
import {
  type TagColorNamespaceResponse,
  type TagMergeRequest,
  type TagResponse,
  type TagStatResponse,
  type TagType
} from "@tagstudio/api-client";
import { Button } from "@tagstudio/ui";
import { AlertCircle, Check, Sparkles } from "lucide-react";

import { ModalHeader } from "@/components/ModalHeader";
import { ModalLayerPortal } from "@/components/ModalLayerPortal";
import { useDraggableModalPosition } from "@/hooks/useDraggableModalPosition";
import { createTagColorLookup, resolveTagChipStyle } from "@/lib/tag-styles";
import { createTagDisplayContext, getTagDisplayLabel } from "@/lib/tag-workflows";
import { clientLog } from "@/observability/logger";

type TagMergeModalProps = {
  open: boolean;
  sourceTags: TagStatResponse[];
  onClose: () => void;
  onMerge: (payload: TagMergeRequest) => Promise<void>;
  tagColors?: TagColorNamespaceResponse[];
  allTags?: TagResponse[];
};

export function TagMergeModal({
  open,
  sourceTags,
  onClose,
  onMerge,
  tagColors,
  allTags = []
}: TagMergeModalProps) {
  const [targetTagId, setTargetTagId] = useState<number>(0);
  const [name, setName] = useState("");
  const [shorthand, setShorthand] = useState("");
  const [aliases, setAliases] = useState<string[]>([]);
  const [autoAliasSourceNames, setAutoAliasSourceNames] = useState(true);
  const [parentIds, setParentIds] = useState<number[]>([]);
  const [disambiguationId, setDisambiguationId] = useState<number | null>(null);
  const [colorNamespace, setColorNamespace] = useState<string | null>(null);
  const [colorSlug, setColorSlug] = useState<string | null>(null);
  const [isCategory, setIsCategory] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  const [tagType, setTagType] = useState<TagType>("content");
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const colorLookup = useMemo(() => createTagColorLookup(tagColors), [tagColors]);

  const displayContext = useMemo(
    () => createTagDisplayContext(allTags.length > 0 ? allTags : sourceTags),
    [allTags, sourceTags]
  );

  const tagById = useMemo(() => {
    const map = new Map<number, TagResponse | TagStatResponse>();
    for (const t of allTags) map.set(t.id, t);
    for (const t of sourceTags) map.set(t.id, t);
    return map;
  }, [allTags, sourceTags]);

  const draggableModal = useDraggableModalPosition({
    open,
    initialPlacement: "center",
    panelId: "tag-merge-modal",
    savePositionOnClose: false
  });

  // Initialize smart defaults when modal opens or sourceTags change
  useEffect(() => {
    if (!open || sourceTags.length < 2) {
      return;
    }

    // Default surviving tag is the one with the highest entry count
    const sorted = [...sourceTags].sort((a, b) => b.entry_count - a.entry_count || a.id - b.id);
    const primary = sorted[0];
    setTargetTagId(primary.id);

    setName(primary.name);
    setShorthand(primary.shorthand ?? sorted.find((t) => t.shorthand)?.shorthand ?? "");

    // Union aliases from all tags
    const allAliases = new Set<string>();
    for (const t of sourceTags) {
      for (const a of t.aliases) {
        allAliases.add(a.trim());
      }
    }
    setAliases(Array.from(allAliases).filter(Boolean));
    setAutoAliasSourceNames(true);

    // Union parents from all tags
    const allParents = new Set<number>();
    for (const t of sourceTags) {
      for (const pid of t.parent_ids) {
        allParents.add(pid);
      }
    }
    setParentIds(Array.from(allParents));

    // Default disambiguation
    const disambigCandidate = sorted.find((t) => t.disambiguation_id)?.disambiguation_id ?? null;
    setDisambiguationId(disambigCandidate);

    // Color from primary or first non-null
    const colorTag = sorted.find((t) => t.color_namespace && t.color_slug) ?? primary;
    setColorNamespace(colorTag.color_namespace);
    setColorSlug(colorTag.color_slug);

    // Flags: union
    setIsCategory(sourceTags.some((t) => t.is_category));
    setIsHidden(sourceTags.every((t) => t.is_hidden));
    const nonContent = sourceTags.find((t) => t.tag_type !== "content");
    setTagType(nonContent ? nonContent.tag_type : "content");
    setIsPending(false);
    setErrorMessage(null);
  }, [open, sourceTags]);

  // Source tags whose names differ from current name
  const otherTagNames = useMemo(() => {
    const currentName = name.trim().toLowerCase();
    return sourceTags.filter((t) => t.name.trim().toLowerCase() !== currentName);
  }, [sourceTags, name]);

  // Effective aliases dynamically including all other source names
  const effectiveAliases = useMemo(() => {
    const list = new Set(aliases.map((a) => a.trim()).filter(Boolean));
    if (autoAliasSourceNames) {
      for (const t of otherTagNames) {
        list.add(t.name.trim());
      }
    }
    return Array.from(list);
  }, [aliases, autoAliasSourceNames, otherTagNames]);

  if (!open || sourceTags.length < 2) {
    return null;
  }

  const survivingTag = sourceTags.find((t) => t.id === targetTagId) ?? sourceTags[0];
  const obsoleteTags = sourceTags.filter((t) => t.id !== targetTagId);
  const totalEntriesAffected = sourceTags.reduce((sum, t) => sum + t.entry_count, 0);

  const handleSurvivingTagSelect = (id: number) => {
    setTargetTagId(id);
    const chosen = sourceTags.find((t) => t.id === id);
    if (chosen) {
      setName(chosen.name);
      if (chosen.shorthand) setShorthand(chosen.shorthand);
      if (chosen.color_namespace && chosen.color_slug) {
        setColorNamespace(chosen.color_namespace);
        setColorSlug(chosen.color_slug);
      }
    }
    setErrorMessage(null);
  };

  const handleExecuteMerge = async () => {
    if (!name.trim() || isPending) return;

    const payload: TagMergeRequest = {
      source_tag_ids: obsoleteTags.map((t) => t.id),
      target_tag_id: targetTagId,
      updated_tag: {
        name: name.trim(),
        shorthand: shorthand.trim() ? shorthand.trim() : null,
        aliases: effectiveAliases,
        parent_ids: parentIds.filter((pid) => pid !== targetTagId),
        disambiguation_id: disambiguationId && parentIds.includes(disambiguationId) ? disambiguationId : null,
        color_namespace: colorNamespace,
        color_slug: colorSlug,
        is_category: isCategory,
        is_hidden: isHidden,
        tag_type: tagType
      }
    };

    setIsPending(true);
    setErrorMessage(null);
    try {
      clientLog.info("tags.merge_modal_submit", {
        targetTagId,
        sourceTagIds: payload.source_tag_ids,
        name: name.trim()
      });
      await onMerge(payload);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to merge tags.";
      setErrorMessage(msg);
      clientLog.error("tags.merge_modal_error", err, { payload });
    } finally {
      setIsPending(false);
    }
  };

  return (
    <ModalLayerPortal open={open} onBackdropClick={onClose}>
      <div
        ref={draggableModal.panelRef}
        className={`overlay-panel panel tag-workflow-panel tag-merge-modal modal-draggable-panel ${draggableModal.isDragging ? "modal-panel-dragging" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Combine and Merge Tags"
        style={{ ...draggableModal.panelStyle, maxWidth: 560 }}
      >
        <ModalHeader
          title={`Merge ${sourceTags.length} Tags`}
          dragHandleProps={draggableModal.dragHandleProps}
          onClose={onClose}
        />

        <div className="tag-merge-body">
          {/* Error Alert if any */}
          {errorMessage ? (
            <div className="tag-merge-error-card flex items-start gap-2 p-2.5 rounded bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs">
              <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <strong className="block font-semibold">Merge Failed:</strong>
                <span>{errorMessage}</span>
                <p className="mt-1 text-slate-500 dark:text-slate-400">
                  Tip: If the backend was running prior to this update, restart the Python API server so new merge routes take effect.
                </p>
              </div>
            </div>
          ) : null}

          {/* Target / Surviving Tag Choice */}
          <div className="settings-row">
            <span className="font-semibold text-xs text-slate-600 dark:text-slate-300">
              Surviving Tag ID:
            </span>
            <div className="tag-merge-surviving-list">
              {sourceTags.map((t) => {
                const isSelected = t.id === targetTagId;
                const style = resolveTagChipStyle(t, colorLookup);
                const label = getTagDisplayLabel(t, displayContext);
                return (
                  <button
                    key={t.id}
                    type="button"
                    className={`tag-merge-surviving-chip ${isSelected ? "tag-merge-surviving-active" : ""}`}
                    style={isSelected ? style : undefined}
                    onClick={() => handleSurvivingTagSelect(t.id)}
                  >
                    {isSelected ? <Check size={13} className="inline mr-1" /> : null}
                    <span className="font-medium">{label}</span>
                    <span className="text-xs opacity-75 ml-1">({t.entry_count} entries)</span>
                  </button>
                );
              })}
            </div>
            <p className="tag-editor-hint">
              The surviving tag keeps its database ID (<code>#{survivingTag.id}</code>). All other selected tags will be merged into it and deleted.
            </p>
          </div>

          {/* Name Selection & Quick Options */}
          <div className="settings-row">
            <span>Name</span>
            <input
              className="input-base"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setErrorMessage(null);
              }}
              placeholder="Merged tag name"
            />
            <div className="tag-merge-option-chips">
              <span className="text-xs text-slate-400">Pick:</span>
              {sourceTags.map((t) => {
                const label = getTagDisplayLabel(t, displayContext);
                return (
                  <button
                    key={t.id}
                    type="button"
                    className={`tag-merge-pick-chip ${name.trim().toLowerCase() === t.name.trim().toLowerCase() ? "tag-merge-pick-chip-selected" : ""}`}
                    onClick={() => {
                      setName(t.name);
                      setErrorMessage(null);
                    }}
                    title={`Use name "${t.name}" from ${label}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Shorthand Selection */}
          <div className="settings-row">
            <span>Shorthand</span>
            <input
              className="input-base"
              value={shorthand}
              onChange={(e) => setShorthand(e.target.value)}
              placeholder="Optional shorthand"
            />
            {sourceTags.some((t) => t.shorthand) ? (
              <div className="tag-merge-option-chips">
                <span className="text-xs text-slate-400">Pick:</span>
                {sourceTags.filter((t) => t.shorthand).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`tag-merge-pick-chip ${shorthand === t.shorthand ? "tag-merge-pick-chip-selected" : ""}`}
                    onClick={() => setShorthand(t.shorthand ?? "")}
                  >
                    {t.shorthand}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {/* Aliases */}
          <div className="settings-row">
            <span>Aliases</span>
            <div className="tag-merge-alias-box">
              <label className="settings-checkbox mb-2">
                <input
                  className="toggle-base"
                  type="checkbox"
                  checked={autoAliasSourceNames}
                  onChange={(e) => setAutoAliasSourceNames(e.target.checked)}
                />
                <span className="text-xs">
                  Include original tag names {otherTagNames.length > 0 ? `(${otherTagNames.map((t) => `"${getTagDisplayLabel(t, displayContext)}"`).join(", ")})` : ""} as search aliases
                </span>
              </label>
              <div className="tag-merge-chips-wrap">
                {effectiveAliases.map((alias, idx) => (
                  <span key={idx} className="tag-selected-chip">
                    {alias}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Parents */}
          <div className="settings-row">
            <span>Parent Tags</span>
            <div className="tag-merge-chips-wrap">
              {parentIds.length === 0 ? (
                <span className="text-xs text-slate-400">No parent tags</span>
              ) : (
                parentIds.map((pid) => {
                  const parentTag = tagById.get(pid);
                  const pStyle = parentTag ? resolveTagChipStyle(parentTag, colorLookup) : undefined;
                  const pLabel = parentTag ? getTagDisplayLabel(parentTag, displayContext) : `#${pid}`;
                  return (
                    <span key={pid} className="tag-selected-chip" style={pStyle}>
                      {pLabel}
                      <button
                        type="button"
                        className="tag-chip-remove"
                        onClick={() => setParentIds((prev) => prev.filter((id) => id !== pid))}
                      >
                        ×
                      </button>
                    </span>
                  );
                })
              )}
            </div>
          </div>

          {/* Color Selection */}
          <div className="settings-row">
            <span>Color</span>
            <div className="tag-merge-color-row">
              {sourceTags.map((t) => {
                const isSelected = colorNamespace === t.color_namespace && colorSlug === t.color_slug;
                const style = resolveTagChipStyle(t, colorLookup);
                const label = getTagDisplayLabel(t, displayContext);
                return (
                  <button
                    key={t.id}
                    type="button"
                    className={`tag-merge-color-chip ${isSelected ? "tag-merge-color-chip-active" : ""}`}
                    style={style}
                    onClick={() => {
                      setColorNamespace(t.color_namespace);
                      setColorSlug(t.color_slug);
                    }}
                  >
                    {label}
                  </button>
                );
              })}
              <button
                type="button"
                className={`tag-merge-pick-chip ${!colorNamespace ? "tag-merge-pick-chip-selected" : ""}`}
                onClick={() => {
                  setColorNamespace(null);
                  setColorSlug(null);
                }}
              >
                No Color
              </button>
            </div>
          </div>

          {/* Properties */}
          <div className="settings-row">
            <span>Properties</span>
            <div className="flex items-center gap-4">
              <label className="settings-checkbox">
                <input
                  className="toggle-base"
                  type="checkbox"
                  checked={isCategory}
                  onChange={(e) => setIsCategory(e.target.checked)}
                />
                <span>Is Category</span>
              </label>
              <label className="settings-checkbox">
                <input
                  className="toggle-base"
                  type="checkbox"
                  checked={isHidden}
                  onChange={(e) => setIsHidden(e.target.checked)}
                />
                <span>Is Hidden</span>
              </label>
            </div>
          </div>

          {/* Impact Alert Summary */}
          <div className="tag-merge-impact-card">
            <Sparkles size={16} className="text-blue-500 flex-shrink-0" />
            <div className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              <p>
                <strong>{sourceTags.length} tags</strong> will be combined into <strong>"{name.trim() || getTagDisplayLabel(survivingTag, displayContext)}"</strong> (ID: #{targetTagId}).
              </p>
              <p className="mt-1 text-slate-500 dark:text-slate-400">
                All <strong>{totalEntriesAffected}</strong> tagged entries will point to the surviving tag. {obsoleteTags.length} redundant tag(s) will be deleted.
              </p>
              <p className="mt-1 text-blue-600 dark:text-blue-400 font-medium">
                ✓ Reversible: You can undo this action immediately after via the snackbar.
              </p>
            </div>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="overlay-panel-actions">
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleExecuteMerge} disabled={isPending || !name.trim()}>
            {isPending ? "Merging..." : `Merge into "${name.trim() || survivingTag.name}"`}
          </Button>
        </div>
      </div>
    </ModalLayerPortal>
  );
}

import { type EntrySummaryResponse } from "@tagstudio/api-client";
import { Archive, Star } from "lucide-react";
import {
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";

import { TAG_ARCHIVED_ID, TAG_FAVORITE_ID } from "@/lib/reserved-tags";

export type ThumbnailContextMenuState = {
  contextEntryId: number;
  targetEntryIds: number[];
  canPaste: boolean;
  favoriteMode: "favorite" | "unfavorite";
  archiveMode: "archive" | "unarchive";
  revealLabel: string;
  disabled: boolean;
};

export type ThumbnailContextMenuAction =
  | "open_file"
  | "reveal_file"
  | "copy_filepath"
  | "copy_tags"
  | "add_tags"
  | "paste_tags"
  | "favorite_toggle"
  | "archive_toggle"
  | "delete_to_trash";

type ThumbnailGridPaneProps = {
  entries: EntrySummaryResponse[];
  totalCount: number;
  selectedEntryIds: number[];
  activeQuery: string;
  searchPending: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onSelectEntry: (entryId: number, event: ReactMouseEvent<HTMLButtonElement>) => void;
  getThumbnailUrl: (
    entryId: number,
    options?: {
      size?: number;
      fit?: "cover" | "contain";
      kind?: "grid" | "preview";
    }
  ) => string;
  contextMenuEnabled: boolean;
  getContextMenuState: (entryId: number) => ThumbnailContextMenuState;
  onContextMenuOpenTarget: (entryId: number, targetEntryIds: number[]) => void;
  onContextMenuAction: (action: ThumbnailContextMenuAction, state: ThumbnailContextMenuState) => void;
  trashFailureMessagesByEntryId: ReadonlyMap<number, string>;
  inactiveEntryIds: ReadonlySet<number>;
};

type MediaKind = "image" | "video" | "other";

type ContextMenuRenderState = {
  x: number;
  y: number;
  state: ThumbnailContextMenuState;
  bounds: {
    left: number;
    right: number;
    top: number;
    bottom: number;
  };
};

const IMAGE_SUFFIXES = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "bmp",
  "tif",
  "tiff",
  "jxl",
  "heic",
  "avif",
  "svg"
]);

const VIDEO_SUFFIXES = new Set(["mp4", "mov", "mkv", "webm", "avi", "m4v"]);
const AUDIO_SUFFIXES = new Set(["mp3", "wav", "ogg", "flac", "m4a"]);
const PDF_SUFFIXES = new Set(["pdf"]);
const ARCHIVE_SUFFIXES = new Set(["zip", "rar", "7z", "tar", "gz"]);

function normalizeSuffix(rawSuffix: string): string {
  return rawSuffix.trim().toLowerCase().replace(/^\./, "");
}

function getMediaKind(rawSuffix: string): MediaKind {
  const suffix = normalizeSuffix(rawSuffix);
  if (IMAGE_SUFFIXES.has(suffix)) {
    return "image";
  }
  if (VIDEO_SUFFIXES.has(suffix)) {
    return "video";
  }
  return "other";
}

function iconForSuffix(rawSuffix: string): string {
  const suffix = normalizeSuffix(rawSuffix);
  if (VIDEO_SUFFIXES.has(suffix)) {
    return "VIDEO";
  }
  if (AUDIO_SUFFIXES.has(suffix)) {
    return "AUDIO";
  }
  if (PDF_SUFFIXES.has(suffix)) {
    return "PDF";
  }
  if (ARCHIVE_SUFFIXES.has(suffix)) {
    return "ARCHIVE";
  }
  return suffix.toUpperCase() || "FILE";
}

export function ThumbnailGridPane({
  entries,
  totalCount,
  selectedEntryIds,
  activeQuery,
  searchPending,
  loadingMore,
  hasMore,
  onLoadMore,
  onSelectEntry,
  getThumbnailUrl,
  contextMenuEnabled,
  getContextMenuState,
  onContextMenuOpenTarget,
  onContextMenuAction,
  trashFailureMessagesByEntryId,
  inactiveEntryIds
}: ThumbnailGridPaneProps) {
  const paneRef = useRef<HTMLElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const [failedMediaIds, setFailedMediaIds] = useState<Set<number>>(() => new Set());
  const [contextMenu, setContextMenu] = useState<ContextMenuRenderState | null>(null);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const getMenuBounds = useCallback(() => {
    const pane = paneRef.current;
    if (!pane) {
      return {
        left: 0,
        right: window.innerWidth,
        top: 0,
        bottom: window.innerHeight
      };
    }

    return {
      left: 0,
      right: pane.clientWidth,
      top: 0,
      bottom: pane.clientHeight
    };
  }, []);

  const openContextMenu = useCallback(
    (entryId: number, event: ReactMouseEvent<HTMLButtonElement>) => {
      if (!contextMenuEnabled) {
        return;
      }

      event.preventDefault();
      const state = getContextMenuState(entryId);
      onContextMenuOpenTarget(entryId, state.targetEntryIds);
      const bounds = getMenuBounds();
      const paneRect = paneRef.current?.getBoundingClientRect();
      const rawX = paneRect ? event.clientX - paneRect.left : event.clientX;
      const rawY = paneRect ? event.clientY - paneRect.top : event.clientY;
      const nextX = Math.max(bounds.left, Math.min(rawX, bounds.right));
      const nextY = Math.max(bounds.top, Math.min(rawY, bounds.bottom));

      setContextMenu({
        x: nextX,
        y: nextY,
        state,
        bounds
      });
    },
    [contextMenuEnabled, getContextMenuState, getMenuBounds, onContextMenuOpenTarget]
  );

  const triggerContextAction = useCallback(
    (action: ThumbnailContextMenuAction) => {
      if (!contextMenu) {
        return;
      }
      onContextMenuAction(action, contextMenu.state);
      closeContextMenu();
    },
    [closeContextMenu, contextMenu, onContextMenuAction]
  );

  const markMediaFailed = useCallback((entryId: number) => {
    setFailedMediaIds((prev) => {
      if (prev.has(entryId)) {
        return prev;
      }
      const next = new Set(prev);
      next.add(entryId);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      if (!contextMenuRef.current?.contains(event.target as Node)) {
        closeContextMenu();
      }
    };

    const onScroll = () => {
      closeContextMenu();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeContextMenu();
      }
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [closeContextMenu, contextMenu]);

  useEffect(() => {
    if (!contextMenu || !contextMenuRef.current) {
      return;
    }

    const menuRect = contextMenuRef.current.getBoundingClientRect();
    const availableMaxX = contextMenu.bounds.right - menuRect.width;
    const availableMaxY = contextMenu.bounds.bottom - menuRect.height;
    const minX = contextMenu.bounds.left;
    const minY = contextMenu.bounds.top;
    const nextX = availableMaxX >= minX ? Math.max(minX, Math.min(contextMenu.x, availableMaxX)) : minX;
    const nextY = availableMaxY >= minY ? Math.max(minY, Math.min(contextMenu.y, availableMaxY)) : minY;

    if (nextX === contextMenu.x && nextY === contextMenu.y) {
      return;
    }

    setContextMenu((prev) => {
      if (!prev) {
        return prev;
      }
      return {
        ...prev,
        x: nextX,
        y: nextY
      };
    });
  }, [contextMenu]);

  const contextMenuStyle = useMemo(() => {
    if (!contextMenu) {
      return undefined;
    }
    const availableWidth = Math.max(64, contextMenu.bounds.right - contextMenu.bounds.left);
    const availableHeight = Math.max(64, contextMenu.bounds.bottom - contextMenu.bounds.top);
    return {
      left: contextMenu.x,
      top: contextMenu.y,
      maxWidth: availableWidth,
      maxHeight: availableHeight
    };
  }, [contextMenu]);

  useEffect(() => {
    if (!hasMore || searchPending || loadingMore) {
      return;
    }

    const sentinel = sentinelRef.current;
    if (!sentinel) {
      return;
    }

    const observer = new IntersectionObserver(
      (entriesList) => {
        if (entriesList.some((entry) => entry.isIntersecting)) {
          onLoadMore();
        }
      },
      {
        rootMargin: "300px"
      }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, onLoadMore, searchPending]);

  useEffect(() => {
    setFailedMediaIds((prev) => {
      if (prev.size === 0) {
        return prev;
      }
      const currentIds = new Set(entries.map((entry) => entry.id));
      const next = new Set<number>();
      let changed = false;
      for (const entryId of prev) {
        if (currentIds.has(entryId)) {
          next.add(entryId);
        } else {
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [entries]);

  const subtitle = useMemo(() => {
    if (!activeQuery) {
      return `${totalCount} entries`;
    }
    return `${totalCount} entries for ${activeQuery}`;
  }, [activeQuery, totalCount]);

  return (
    <section ref={paneRef} className="pane panel thumb-pane">
      <header className="thumb-pane-header">
        <h2 className="panel-title m-0">Files</h2>
        <p className="thumb-pane-subtitle m-0">{subtitle}</p>
      </header>

      <div className="thumb-grid-scroll">
        {entries.length === 0 && !searchPending ? (
          <p className="thumb-empty">No entries match this filter.</p>
        ) : null}

        <div className="thumb-grid" role="listbox" aria-label="Library entries">
          {entries.map((entry) => {
            const selected = selectedEntryIds.includes(entry.id);
            const mediaKind = getMediaKind(entry.suffix);
            const showMedia = mediaKind !== "other" && !failedMediaIds.has(entry.id);
            const isFavorite = entry.tag_ids.includes(TAG_FAVORITE_ID);
            const isArchived = entry.tag_ids.includes(TAG_ARCHIVED_ID);
            const isInactive = inactiveEntryIds.has(entry.id);
            const trashFailureMessage = trashFailureMessagesByEntryId.get(entry.id);

            return (
              <button
                key={entry.id}
                type="button"
                className={[
                  "thumb-card",
                  selected ? "thumb-card-selected" : "",
                  isArchived ? "thumb-card-archived" : "",
                  isInactive ? "thumb-card-inactive" : "",
                  trashFailureMessage ? "thumb-card-trash-failed" : ""
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={(event) => onSelectEntry(entry.id, event)}
                onContextMenu={(event) => {
                  if (isInactive) {
                    return;
                  }
                  openContextMenu(entry.id, event);
                }}
                title={
                  isInactive
                    ? `${entry.path}\nMoved to Trash. Refresh search to remove this card.`
                    : (trashFailureMessage ? `${entry.path}\n${trashFailureMessage}` : entry.path)
                }
                aria-selected={selected}
                disabled={isInactive}
              >
                <div className={`thumb-media ${isArchived ? "thumb-media-archived" : ""}`}>
                  {showMedia ? (
                    <img
                      src={getThumbnailUrl(entry.id, { kind: "grid", fit: "cover" })}
                      alt={entry.filename}
                      loading="lazy"
                      decoding="async"
                      className="thumb-media-image"
                      onError={() => markMediaFailed(entry.id)}
                    />
                  ) : null}
                  {!showMedia ? <span className="thumb-media-icon">{iconForSuffix(entry.suffix)}</span> : null}
                  {isArchived ? (
                    <span className="thumb-archive-badge" aria-label="Archived">
                      <Archive size={12} />
                    </span>
                  ) : null}
                  {isFavorite ? (
                    <span className="thumb-favorite-badge" aria-label="Favorited">
                      <Star size={12} fill="currentColor" />
                    </span>
                  ) : null}
                  {showMedia && mediaKind === "video" ? (
                    <span className="thumb-video-badge" aria-hidden="true">
                      ▶
                    </span>
                  ) : null}
                </div>
                <span className="thumb-label" title={entry.path}>
                  {entry.filename}
                </span>
              </button>
            );
          })}
        </div>

        <div ref={sentinelRef} className="thumb-grid-sentinel" aria-hidden="true" />

        {searchPending ? <p className="thumb-loading">Loading results...</p> : null}
        {loadingMore ? <p className="thumb-loading">Loading more...</p> : null}
      </div>

      {contextMenu && contextMenuEnabled ? (
        <div
          ref={contextMenuRef}
          className="thumb-context-menu"
          role="menu"
          style={contextMenuStyle}
        >
          <button
            type="button"
            role="menuitem"
            className="thumb-context-menu-item"
            disabled={contextMenu.state.disabled}
            onClick={() => triggerContextAction("open_file")}
          >
            Open
          </button>
          <button
            type="button"
            role="menuitem"
            className="thumb-context-menu-item"
            disabled={contextMenu.state.disabled}
            onClick={() => triggerContextAction("reveal_file")}
          >
            {contextMenu.state.revealLabel}
          </button>
          <button
            type="button"
            role="menuitem"
            className="thumb-context-menu-item"
            disabled={contextMenu.state.disabled}
            onClick={() => triggerContextAction("copy_filepath")}
          >
            Copy Filepath
          </button>

          <div className="thumb-context-menu-separator" />

          <button
            type="button"
            role="menuitem"
            className="thumb-context-menu-item"
            disabled={contextMenu.state.disabled}
            onClick={() => triggerContextAction("copy_tags")}
          >
            Copy Tags
          </button>
          <button
            type="button"
            role="menuitem"
            className="thumb-context-menu-item"
            disabled={contextMenu.state.disabled}
            onClick={() => triggerContextAction("add_tags")}
          >
            Add Tags
          </button>
          {contextMenu.state.canPaste ? (
            <button
              type="button"
              role="menuitem"
              className="thumb-context-menu-item"
              disabled={contextMenu.state.disabled}
              onClick={() => triggerContextAction("paste_tags")}
            >
              Paste Tags
            </button>
          ) : null}

          <div className="thumb-context-menu-separator" />

          <button
            type="button"
            role="menuitem"
            className="thumb-context-menu-item"
            disabled={contextMenu.state.disabled}
            onClick={() => triggerContextAction("favorite_toggle")}
          >
            {contextMenu.state.favoriteMode === "favorite" ? "Favorite" : "Unfavorite"}
          </button>
          <button
            type="button"
            role="menuitem"
            className="thumb-context-menu-item"
            disabled={contextMenu.state.disabled}
            onClick={() => triggerContextAction("archive_toggle")}
          >
            {contextMenu.state.archiveMode === "archive" ? "Archive" : "Unarchive"}
          </button>

          <div className="thumb-context-menu-separator" />

          <button
            type="button"
            role="menuitem"
            className="thumb-context-menu-item thumb-context-menu-item-danger"
            disabled={contextMenu.state.disabled}
            onClick={() => triggerContextAction("delete_to_trash")}
          >
            Delete to Trash
          </button>
        </div>
      ) : null}
    </section>
  );
}

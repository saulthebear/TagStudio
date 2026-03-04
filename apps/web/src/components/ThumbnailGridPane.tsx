import { type EntrySummaryResponse } from "@tagstudio/api-client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type ThumbnailGridPaneProps = {
  entries: EntrySummaryResponse[];
  totalCount: number;
  selectedEntryId: number | null;
  activeQuery: string;
  searchPending: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onSelectEntry: (entryId: number) => void;
  getThumbnailUrl: (
    entryId: number,
    options?: {
      size?: number;
      fit?: "cover" | "contain";
      kind?: "grid" | "preview";
    }
  ) => string;
};

type MediaKind = "image" | "video" | "other";

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

const VIDEO_SUFFIXES = new Set(["mp4", "mov", "mkv", "webm", "avi"]);
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
  selectedEntryId,
  activeQuery,
  searchPending,
  loadingMore,
  hasMore,
  onLoadMore,
  onSelectEntry,
  getThumbnailUrl
}: ThumbnailGridPaneProps) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [failedMediaIds, setFailedMediaIds] = useState<Set<number>>(() => new Set());

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
    <section className="pane panel thumb-pane">
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
            const selected = selectedEntryId === entry.id;
            const mediaKind = getMediaKind(entry.suffix);
            const showMedia = mediaKind !== "other" && !failedMediaIds.has(entry.id);
            return (
              <button
                key={entry.id}
                type="button"
                className={`thumb-card ${selected ? "thumb-card-selected" : ""}`}
                onClick={() => onSelectEntry(entry.id)}
                aria-selected={selected}
              >
                <div className="thumb-media">
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
                  {showMedia && mediaKind === "video" ? (
                    <span className="thumb-video-badge" aria-hidden="true">
                      ▶
                    </span>
                  ) : null}
                  {!showMedia ? <span className="thumb-media-icon">{iconForSuffix(entry.suffix)}</span> : null}
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
    </section>
  );
}

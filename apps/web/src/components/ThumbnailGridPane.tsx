import { type EntrySummaryResponse } from "@tagstudio/api-client";
import { useEffect, useMemo, useRef } from "react";

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
  getMediaUrl: (entryId: number) => string;
};

const IMAGE_SUFFIXES = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".bmp",
  ".tif",
  ".tiff",
  ".jxl",
  ".heic",
  ".avif",
  ".svg"
]);

function isImageEntry(entry: EntrySummaryResponse): boolean {
  return IMAGE_SUFFIXES.has(entry.suffix.toLowerCase());
}

function iconForSuffix(suffix: string): string {
  const lower = suffix.toLowerCase();
  if ([".mp4", ".mov", ".mkv", ".webm", ".avi"].includes(lower)) {
    return "VIDEO";
  }
  if ([".mp3", ".wav", ".ogg", ".flac", ".m4a"].includes(lower)) {
    return "AUDIO";
  }
  if ([".pdf"].includes(lower)) {
    return "PDF";
  }
  if ([".zip", ".rar", ".7z", ".tar", ".gz"].includes(lower)) {
    return "ARCHIVE";
  }
  return lower.replace(".", "").toUpperCase() || "FILE";
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
  getMediaUrl
}: ThumbnailGridPaneProps) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);

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
            const imageEntry = isImageEntry(entry);
            return (
              <button
                key={entry.id}
                type="button"
                className={`thumb-card ${selected ? "thumb-card-selected" : ""}`}
                onClick={() => onSelectEntry(entry.id)}
                aria-selected={selected}
              >
                <div className="thumb-media">
                  {imageEntry ? (
                    <img
                      src={getMediaUrl(entry.id)}
                      alt={entry.filename}
                      loading="lazy"
                      className="thumb-media-image"
                    />
                  ) : (
                    <span className="thumb-media-icon">{iconForSuffix(entry.suffix)}</span>
                  )}
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

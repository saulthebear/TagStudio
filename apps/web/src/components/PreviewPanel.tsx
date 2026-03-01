import { type MutableRefObject } from "react";
import { type EntryResponse, type PreviewResponse } from "@tagstudio/api-client";
import { Button } from "@tagstudio/ui";

type PreviewPanelProps = {
  selectedEntry: EntryResponse | null;
  preview: PreviewResponse | undefined;
  mediaRef: MutableRefObject<HTMLMediaElement | null>;
  autoplay: boolean;
  loop: boolean;
  muted: boolean;
  volume: number;
  onAutoplayChange: (value: boolean) => void;
  onLoopChange: (value: boolean) => void;
  onMutedChange: (value: boolean) => void;
  onVolumeChange: (value: number) => void;
  getMediaUrl: (entryId: number) => string;
};

export function PreviewPanel({
  selectedEntry,
  preview,
  mediaRef,
  autoplay,
  loop,
  muted,
  volume,
  onAutoplayChange,
  onLoopChange,
  onMutedChange,
  onVolumeChange,
  getMediaUrl
}: PreviewPanelProps) {
  const hasSelectedEntry = selectedEntry !== null;

  return (
    <div className="panel min-h-[280px]">
      <h2 className="mt-0 text-lg">Preview</h2>
      {!hasSelectedEntry ? <p className="text-sm opacity-75">Select an entry to render preview.</p> : null}
      {hasSelectedEntry && preview?.preview_kind === "image" ? (
        <img
          src={getMediaUrl(selectedEntry.id)}
          alt={selectedEntry.filename}
          className="max-h-[420px] max-w-full rounded-md border border-[var(--border)] object-contain"
        />
      ) : null}
      {hasSelectedEntry && preview?.preview_kind === "video" ? (
        <div className="space-y-2">
          <video
            ref={(element) => {
              mediaRef.current = element;
            }}
            src={getMediaUrl(selectedEntry.id)}
            controls
            className="max-h-[280px] w-full rounded-md border border-[var(--border)]"
          />
          <MediaControls
            mediaRef={mediaRef}
            autoplay={autoplay}
            loop={loop}
            muted={muted}
            volume={volume}
            onAutoplayChange={onAutoplayChange}
            onLoopChange={onLoopChange}
            onMutedChange={onMutedChange}
            onVolumeChange={onVolumeChange}
          />
        </div>
      ) : null}
      {hasSelectedEntry && preview?.preview_kind === "audio" ? (
        <div className="space-y-2">
          <audio
            ref={(element) => {
              mediaRef.current = element;
            }}
            src={getMediaUrl(selectedEntry.id)}
            controls
            className="w-full"
          />
          <MediaControls
            mediaRef={mediaRef}
            autoplay={autoplay}
            loop={loop}
            muted={muted}
            volume={volume}
            onAutoplayChange={onAutoplayChange}
            onLoopChange={onLoopChange}
            onMutedChange={onMutedChange}
            onVolumeChange={onVolumeChange}
          />
        </div>
      ) : null}
      {hasSelectedEntry && preview?.preview_kind === "text" ? (
        <pre className="max-h-[320px] overflow-auto rounded-md border border-[var(--border)] bg-white p-2 text-xs">
          {preview.text_excerpt || "(empty text)"}
        </pre>
      ) : null}
      {hasSelectedEntry && preview && (preview.preview_kind === "binary" || preview.preview_kind === "missing") ? (
        <p className="text-sm opacity-75">
          {preview.preview_kind === "missing"
            ? preview.text_excerpt
            : "Preview not available for this file type."}
        </p>
      ) : null}
    </div>
  );
}

type MediaControlsProps = {
  mediaRef: MutableRefObject<HTMLMediaElement | null>;
  autoplay: boolean;
  loop: boolean;
  muted: boolean;
  volume: number;
  onAutoplayChange: (value: boolean) => void;
  onLoopChange: (value: boolean) => void;
  onMutedChange: (value: boolean) => void;
  onVolumeChange: (value: number) => void;
};

function MediaControls({
  mediaRef,
  autoplay,
  loop,
  muted,
  volume,
  onAutoplayChange,
  onLoopChange,
  onMutedChange,
  onVolumeChange
}: MediaControlsProps) {
  const play = () => {
    void mediaRef.current?.play();
  };
  const pause = () => {
    mediaRef.current?.pause();
  };
  const seekBy = (seconds: number) => {
    if (!mediaRef.current) {
      return;
    }
    mediaRef.current.currentTime = Math.max(0, mediaRef.current.currentTime + seconds);
  };

  return (
    <div className="space-y-2 text-xs">
      <div className="flex gap-2">
        <Button variant="secondary" onClick={play}>
          Play
        </Button>
        <Button variant="secondary" onClick={pause}>
          Pause
        </Button>
        <Button variant="secondary" onClick={() => seekBy(-5)}>
          -5s
        </Button>
        <Button variant="secondary" onClick={() => seekBy(5)}>
          +5s
        </Button>
      </div>
      <label className="inline-flex items-center gap-2">
        <input type="checkbox" checked={autoplay} onChange={(event) => onAutoplayChange(event.target.checked)} />
        Autoplay
      </label>
      <label className="ml-3 inline-flex items-center gap-2">
        <input type="checkbox" checked={loop} onChange={(event) => onLoopChange(event.target.checked)} />
        Loop
      </label>
      <label className="ml-3 inline-flex items-center gap-2">
        <input type="checkbox" checked={muted} onChange={(event) => onMutedChange(event.target.checked)} />
        Muted
      </label>
      <label className="ml-3 inline-flex items-center gap-2">
        Volume
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          onChange={(event) => onVolumeChange(Number(event.target.value))}
        />
      </label>
    </div>
  );
}

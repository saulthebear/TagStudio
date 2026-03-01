import { Button } from "@tagstudio/ui";

type LibraryPanelProps = {
  libraryPath: string;
  canPickDirectory: boolean;
  openPending: boolean;
  onLibraryPathChange: (value: string) => void;
  onBrowse: () => void;
  onOpen: () => void;
  onCreate: () => void;
};

export function LibraryPanel({
  libraryPath,
  canPickDirectory,
  openPending,
  onLibraryPathChange,
  onBrowse,
  onOpen,
  onCreate
}: LibraryPanelProps) {
  return (
    <section className="panel mb-4 grid gap-3 md:grid-cols-[1fr_auto_auto_auto]">
      <input
        className="input-base"
        placeholder="/path/to/library"
        value={libraryPath}
        onChange={(event) => onLibraryPathChange(event.target.value)}
      />
      <Button disabled={!canPickDirectory} variant="secondary" onClick={onBrowse}>
        Browse...
      </Button>
      <Button disabled={!libraryPath || openPending} onClick={onOpen}>
        Open Library
      </Button>
      <Button disabled={!libraryPath || openPending} variant="secondary" onClick={onCreate}>
        Create Library
      </Button>
    </section>
  );
}

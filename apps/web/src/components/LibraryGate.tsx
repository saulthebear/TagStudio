import { Button } from "@tagstudio/ui";

type LibraryGateProps = {
  libraryPath: string;
  openPending: boolean;
  onLibraryPathChange: (value: string) => void;
  onOpen: () => void;
  onCreate: () => void;
};

export function LibraryGate({
  libraryPath,
  openPending,
  onLibraryPathChange,
  onOpen,
  onCreate
}: LibraryGateProps) {
  return (
    <section className="library-gate panel" aria-label="Open or create a library">
      <h1 className="m-0 text-3xl font-semibold tracking-tight text-slate-900">TagStudio</h1>
      <p className="m-0 text-sm text-slate-600">
        Open a library to browse files, preview media, and edit tags.
      </p>
      <div className="library-gate-controls">
        <input
          className="input-base"
          placeholder="/path/to/library"
          value={libraryPath}
          onChange={(event) => onLibraryPathChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") {
              return;
            }
            event.preventDefault();
            if (!libraryPath || openPending) {
              return;
            }
            onOpen();
          }}
        />
        <Button disabled={!libraryPath || openPending} onClick={onOpen}>
          Open Library
        </Button>
        <Button variant="secondary" disabled={!libraryPath || openPending} onClick={onCreate}>
          Create Library
        </Button>
      </div>
    </section>
  );
}

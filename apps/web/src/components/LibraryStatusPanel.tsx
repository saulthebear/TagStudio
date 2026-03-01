type LibraryStatusPanelProps = {
  isOpen: boolean;
  entriesCount: number;
  tagsCount: number;
};

export function LibraryStatusPanel({
  isOpen,
  entriesCount,
  tagsCount
}: LibraryStatusPanelProps) {
  return (
    <section className="panel mb-4">
      <div className="grid gap-2 text-sm text-slate-600 md:grid-cols-3">
        <p className="m-0 rounded-lg bg-white/80 px-3 py-2">Library: <strong className="text-slate-900">{isOpen ? "Open" : "Closed"}</strong></p>
        <p className="m-0 rounded-lg bg-white/80 px-3 py-2">Entries: <strong className="text-slate-900">{entriesCount}</strong></p>
        <p className="m-0 rounded-lg bg-white/80 px-3 py-2">Tags: <strong className="text-slate-900">{tagsCount}</strong></p>
      </div>
    </section>
  );
}

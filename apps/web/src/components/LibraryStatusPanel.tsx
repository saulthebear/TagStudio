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
      <p className="m-0 text-sm">
        Library status: {isOpen ? "open" : "closed"} | Entries: {entriesCount} | Tags: {tagsCount}
      </p>
    </section>
  );
}

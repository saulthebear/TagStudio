import { Button } from "@tagstudio/ui";

type PaginationPanelProps = {
  activeQuery: string;
  totalCount: number;
  pageIndex: number;
  totalPages: number;
  canPageBack: boolean;
  canPageForward: boolean;
  onPrevious: () => void;
  onNext: () => void;
};

export function PaginationPanel({
  activeQuery,
  totalCount,
  pageIndex,
  totalPages,
  canPageBack,
  canPageForward,
  onPrevious,
  onNext
}: PaginationPanelProps) {
  return (
    <section className="panel mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div className="text-sm text-slate-600">
        Query: <strong>{activeQuery || "(all entries)"}</strong> | Results: {totalCount} | Page:{" "}
        {totalPages === 0 ? 0 : pageIndex + 1}/{totalPages}
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" disabled={!canPageBack} onClick={onPrevious}>
          Previous
        </Button>
        <Button variant="secondary" disabled={!canPageForward} onClick={onNext}>
          Next
        </Button>
      </div>
    </section>
  );
}

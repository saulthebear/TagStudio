import { type SearchResponse } from "@tagstudio/api-client";

type ResultsPanelProps = {
  results: SearchResponse | null;
  onSelectEntry: (entryId: number) => void;
};

export function ResultsPanel({ results, onSelectEntry }: ResultsPanelProps) {
  return (
    <div className="panel min-h-[280px]">
      <h2 className="mt-0 text-lg">Results</h2>
      {results ? (
        <ul className="m-0 list-none space-y-1 p-0">
          {results.entries.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                className="w-full rounded-md border border-transparent px-2 py-1 text-left text-sm hover:border-[var(--border)] hover:bg-white"
                onClick={() => onSelectEntry(entry.id)}
              >
                {entry.path} ({entry.id})
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm opacity-75">Run a search to view matching entries.</p>
      )}
    </div>
  );
}

import { type SearchResponse } from "@tagstudio/api-client";

type ResultsPanelProps = {
  results: SearchResponse | null;
  onSelectEntry: (entryId: number) => void;
};

export function ResultsPanel({ results, onSelectEntry }: ResultsPanelProps) {
  return (
    <div className="panel min-h-[360px]">
      <h2 className="panel-title mt-0">Results</h2>
      {results ? (
        <ul className="m-0 list-none space-y-2 p-0">
          {results.entries.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                className="w-full rounded-xl border border-transparent bg-white/60 px-3 py-2 text-left text-sm text-slate-700 transition hover:border-[var(--color-border-strong)] hover:bg-white hover:shadow-sm"
                onClick={() => onSelectEntry(entry.id)}
              >
                {entry.path} ({entry.id})
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">Run a search to view matching entries.</p>
      )}
    </div>
  );
}

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { type EntryResponse, type SearchResponse } from "@tagstudio/api-client";
import { Button } from "@tagstudio/ui";

import { api } from "@/lib/client";

export function App() {
  const queryClient = useQueryClient();
  const [libraryPath, setLibraryPath] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<EntryResponse | null>(null);

  const health = useQuery({
    queryKey: ["health"],
    queryFn: () => api.health(),
    refetchInterval: 30000
  });

  const libraryState = useQuery({
    queryKey: ["library-state"],
    queryFn: () => api.getLibraryState(),
    refetchInterval: 2000
  });

  const openLibrary = useMutation({
    mutationFn: (mode: "open" | "create") =>
      mode === "create"
        ? api.createLibrary({ path: libraryPath })
        : api.openLibrary({ path: libraryPath }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["library-state"] });
      setResults(null);
      setSelectedEntry(null);
    }
  });

  const runSearch = useMutation({
    mutationFn: (query: string) => api.search({ query, page_size: 200 }),
    onSuccess: (data) => {
      setResults(data);
      setSelectedEntry(null);
    }
  });

  const loadEntry = useMutation({
    mutationFn: (entryId: number) => api.getEntry(entryId),
    onSuccess: (entry) => setSelectedEntry(entry)
  });

  const tagsDisplay = useMemo(
    () =>
      selectedEntry?.tags
        .map((tag) => `${tag.name}${tag.shorthand ? ` (${tag.shorthand})` : ""}`)
        .join(", ") ?? "",
    [selectedEntry]
  );

  return (
    <main className="app-shell">
      <header className="panel mb-4">
        <h1 className="m-0 text-3xl font-semibold tracking-tight">TagStudio Web Foundation</h1>
        <p className="mb-0 mt-2 text-sm opacity-80">
          Electron-first shell with browser-safe renderer and local Python API.
        </p>
        <p className="mb-0 mt-2 text-xs">
          API: {api.baseUrl} | Health: {health.data?.status ?? "checking..."}
        </p>
      </header>

      <section className="panel mb-4 grid gap-3 md:grid-cols-[1fr_auto_auto]">
        <input
          className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm"
          placeholder="/path/to/library"
          value={libraryPath}
          onChange={(event) => setLibraryPath(event.target.value)}
        />
        <Button disabled={!libraryPath || openLibrary.isPending} onClick={() => openLibrary.mutate("open")}>
          Open Library
        </Button>
        <Button
          disabled={!libraryPath || openLibrary.isPending}
          variant="secondary"
          onClick={() => openLibrary.mutate("create")}
        >
          Create Library
        </Button>
      </section>

      <section className="panel mb-4">
        <p className="m-0 text-sm">
          Library status: {libraryState.data?.is_open ? "open" : "closed"} | Entries:{" "}
          {libraryState.data?.entries_count ?? 0} | Tags: {libraryState.data?.tags_count ?? 0}
        </p>
      </section>

      <section className="panel mb-4 grid gap-3 md:grid-cols-[1fr_auto]">
        <input
          className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm"
          placeholder='Search query (e.g. tag:"foo" or path:"*.png")'
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
        />
        <Button
          disabled={!libraryState.data?.is_open || runSearch.isPending}
          onClick={() => runSearch.mutate(searchQuery)}
        >
          Search
        </Button>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="panel min-h-[220px]">
          <h2 className="mt-0 text-lg">Results</h2>
          {results ? (
            <ul className="m-0 list-none space-y-1 p-0">
              {results.entries.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    className="w-full rounded-md border border-transparent px-2 py-1 text-left text-sm hover:border-[var(--border)] hover:bg-white"
                    onClick={() => loadEntry.mutate(entry.id)}
                  >
                    {entry.path}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm opacity-75">Run a search to view matching entries.</p>
          )}
        </div>

        <div className="panel min-h-[220px]">
          <h2 className="mt-0 text-lg">Entry Detail</h2>
          {selectedEntry ? (
            <div className="space-y-2 text-sm">
              <div>
                <strong>Path:</strong> {selectedEntry.path}
              </div>
              <div>
                <strong>Tags:</strong> {tagsDisplay || "none"}
              </div>
              <div>
                <strong>Fields:</strong>
                <ul className="m-0 mt-1 list-disc pl-5">
                  {selectedEntry.fields.map((field) => (
                    <li key={field.id}>
                      {field.type_name}: {String(field.value ?? "")}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <p className="text-sm opacity-75">Select a result to inspect tags and fields.</p>
          )}
        </div>
      </section>
    </main>
  );
}

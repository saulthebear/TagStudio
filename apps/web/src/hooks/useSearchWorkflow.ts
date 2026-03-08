import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type EntrySummaryResponse, type SortingMode } from "@tagstudio/api-client";

import { api } from "@/api/client";
import { dedupeEntries, type SearchOverrides } from "@/hooks/workflowTypes";

export type SearchRequest = {
  query: string;
  pageIndex: number;
  append: boolean;
} & SearchOverrides;

export type ExecuteSearchFn = (request: SearchRequest) => Promise<void>;

const FOREGROUND_PREWARM_LIMIT = 48;
const PREWARM_BATCH_SIZE = 100;

type UseSearchWorkflowArgs = {
  activeLibraryPath: string | null;
  isLibraryOpen: boolean;
  settingsHydrated: boolean;
  settingsFetching: boolean;
  sortingMode: SortingMode;
  ascending: boolean;
  showHiddenEntries: boolean;
  pageSize: number;
  onError: (message: string) => void;
  onClearError: () => void;
};

type UseSearchWorkflowResult = {
  searchInput: string;
  setSearchInput: (value: string) => void;
  activeQuery: string;
  entries: EntrySummaryResponse[];
  totalCount: number;
  nextPageIndex: number;
  hasMore: boolean;
  searchPending: boolean;
  loadingMore: boolean;
  searchResultsStale: boolean;
  markSearchResultsStale: () => void;
  applyTagMutationToEntries: (entryIds: number[], tagId: number, mode: "add" | "remove") => void;
  executeSearch: ExecuteSearchFn;
  searchFromInput: () => void;
  loadMore: () => void;
};

export function useSearchWorkflow({
  activeLibraryPath,
  isLibraryOpen,
  settingsHydrated,
  settingsFetching,
  sortingMode,
  ascending,
  showHiddenEntries,
  pageSize,
  onError,
  onClearError
}: UseSearchWorkflowArgs): UseSearchWorkflowResult {
  const searchRequestIdRef = useRef(0);
  const prewarmedEntryIdsRef = useRef<Set<number>>(new Set());
  const activeRandomSeedRef = useRef<number | null>(null);
  const previousSortingModeRef = useRef<SortingMode>(sortingMode);

  const [searchInput, setSearchInput] = useState("");
  const [activeQuery, setActiveQuery] = useState("");

  const [entries, setEntries] = useState<EntrySummaryResponse[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [nextPageIndex, setNextPageIndex] = useState(0);
  const [searchPending, setSearchPending] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [needsInitialSearch, setNeedsInitialSearch] = useState(false);
  const [searchResultsStale, setSearchResultsStale] = useState(false);

  useEffect(() => {
    setNeedsInitialSearch(activeLibraryPath !== null);
    setEntries([]);
    setTotalCount(0);
    setNextPageIndex(0);
    setSearchInput("");
    setActiveQuery("");
    setSearchResultsStale(false);
    prewarmedEntryIdsRef.current = new Set();
    activeRandomSeedRef.current = null;
  }, [activeLibraryPath]);

  useEffect(() => {
    if (
      previousSortingModeRef.current === "sorting.mode.random" &&
      sortingMode !== "sorting.mode.random"
    ) {
      activeRandomSeedRef.current = null;
    }
    previousSortingModeRef.current = sortingMode;
  }, [sortingMode]);

  const prewarmEntries = useCallback((incomingEntries: EntrySummaryResponse[]) => {
    if (incomingEntries.length === 0) {
      return;
    }

    const unseenIds = incomingEntries
      .map((entry) => entry.id)
      .filter((entryId) => !prewarmedEntryIdsRef.current.has(entryId));

    if (unseenIds.length === 0) {
      return;
    }

    for (const entryId of unseenIds) {
      prewarmedEntryIdsRef.current.add(entryId);
    }

    const foreground = unseenIds.slice(0, FOREGROUND_PREWARM_LIMIT);
    const background = unseenIds.slice(FOREGROUND_PREWARM_LIMIT);

    if (foreground.length > 0) {
      void api
        .prewarmThumbnails({
          entry_ids: foreground,
          fit: "cover",
          kind: "grid",
          priority: "foreground"
        })
        .catch(() => {});
    }

    for (let index = 0; index < background.length; index += PREWARM_BATCH_SIZE) {
      const batch = background.slice(index, index + PREWARM_BATCH_SIZE);
      if (batch.length === 0) {
        continue;
      }
      void api
        .prewarmThumbnails({
          entry_ids: batch,
          fit: "cover",
          kind: "grid",
          priority: "background"
        })
        .catch(() => {});
    }
  }, []);

  const executeSearch = useCallback<ExecuteSearchFn>(
    async ({
      query,
      pageIndex,
      append,
      sortingMode: sortingModeOverride,
      ascending: ascendingOverride,
      showHiddenEntries: showHiddenOverride,
      pageSize: pageSizeOverride
    }) => {
      if (!isLibraryOpen) {
        return;
      }

      if (append && (loadingMore || searchPending)) {
        return;
      }

      const normalizedQuery = query.trim();
      const effectiveSortingMode = sortingModeOverride ?? sortingMode;
      const isRandomSort = effectiveSortingMode === "sorting.mode.random";
      if (!isRandomSort) {
        activeRandomSeedRef.current = null;
      }
      const requestId = ++searchRequestIdRef.current;

      if (append) {
        setLoadingMore(true);
      } else {
        setSearchPending(true);
      }

      try {
        const data = await api.search({
          query: normalizedQuery,
          page_index: pageIndex,
          page_size: pageSizeOverride ?? pageSize,
          sorting_mode: effectiveSortingMode,
          random_seed: isRandomSort && append ? (activeRandomSeedRef.current ?? undefined) : undefined,
          ascending: ascendingOverride ?? ascending,
          show_hidden_entries: showHiddenOverride ?? showHiddenEntries
        });

        if (requestId !== searchRequestIdRef.current) {
          return;
        }

        activeRandomSeedRef.current = isRandomSort ? (data.random_seed ?? null) : null;
        onClearError();
        setActiveQuery(normalizedQuery);
        setTotalCount(data.total_count);
        setNextPageIndex(pageIndex + 1);

        if (append) {
          setEntries((prev) => dedupeEntries([...prev, ...data.entries]));
        } else {
          setEntries(data.entries);
          setSearchResultsStale(false);
        }
        prewarmEntries(data.entries);
      } catch (error) {
        if (requestId !== searchRequestIdRef.current) {
          return;
        }
        onError(error instanceof Error ? error.message : "Search failed.");
      } finally {
        if (requestId !== searchRequestIdRef.current) {
          return;
        }
        setSearchPending(false);
        setLoadingMore(false);
      }
    },
    [
      ascending,
      isLibraryOpen,
      loadingMore,
      onClearError,
      onError,
      pageSize,
      prewarmEntries,
      searchPending,
      showHiddenEntries,
      sortingMode
    ]
  );

  useEffect(() => {
    if (!isLibraryOpen || !needsInitialSearch) {
      return;
    }

    if (!settingsHydrated && settingsFetching) {
      return;
    }

    void executeSearch({ query: "", pageIndex: 0, append: false });
    setNeedsInitialSearch(false);
  }, [
    executeSearch,
    isLibraryOpen,
    needsInitialSearch,
    settingsFetching,
    settingsHydrated
  ]);

  const searchFromInput = useCallback(() => {
    void executeSearch({ query: searchInput, pageIndex: 0, append: false });
  }, [executeSearch, searchInput]);

  const loadMore = useCallback(() => {
    void executeSearch({ query: activeQuery, pageIndex: nextPageIndex, append: true });
  }, [activeQuery, executeSearch, nextPageIndex]);

  const hasMore = useMemo(() => entries.length < totalCount, [entries.length, totalCount]);

  const markSearchResultsStale = useCallback(() => {
    setSearchResultsStale(true);
  }, []);

  const applyTagMutationToEntries = useCallback(
    (entryIds: number[], tagId: number, mode: "add" | "remove") => {
      if (entryIds.length === 0) {
        return;
      }

      const targetIds = new Set(entryIds);
      setEntries((prev) =>
        prev.map((entry) => {
          if (!targetIds.has(entry.id)) {
            return entry;
          }

          const hasTag = entry.tag_ids.includes(tagId);
          if (mode === "add" && hasTag) {
            return entry;
          }
          if (mode === "remove" && !hasTag) {
            return entry;
          }

          const nextTagIds =
            mode === "add"
              ? [...entry.tag_ids, tagId]
              : entry.tag_ids.filter((candidateTagId) => candidateTagId !== tagId);
          return {
            ...entry,
            tag_ids: nextTagIds
          };
        })
      );
    },
    []
  );

  return {
    searchInput,
    setSearchInput,
    activeQuery,
    entries,
    totalCount,
    nextPageIndex,
    hasMore,
    searchPending,
    loadingMore,
    searchResultsStale,
    markSearchResultsStale,
    applyTagMutationToEntries,
    executeSearch,
    searchFromInput,
    loadMore
  };
}

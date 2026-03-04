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

  const [searchInput, setSearchInput] = useState("");
  const [activeQuery, setActiveQuery] = useState("");

  const [entries, setEntries] = useState<EntrySummaryResponse[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [nextPageIndex, setNextPageIndex] = useState(0);
  const [searchPending, setSearchPending] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [needsInitialSearch, setNeedsInitialSearch] = useState(false);

  useEffect(() => {
    setNeedsInitialSearch(activeLibraryPath !== null);
    setEntries([]);
    setTotalCount(0);
    setNextPageIndex(0);
    setSearchInput("");
    setActiveQuery("");
  }, [activeLibraryPath]);

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
          sorting_mode: sortingModeOverride ?? sortingMode,
          ascending: ascendingOverride ?? ascending,
          show_hidden_entries: showHiddenOverride ?? showHiddenEntries
        });

        if (requestId !== searchRequestIdRef.current) {
          return;
        }

        onClearError();
        setActiveQuery(normalizedQuery);
        setTotalCount(data.total_count);
        setNextPageIndex(pageIndex + 1);

        if (append) {
          setEntries((prev) => dedupeEntries([...prev, ...data.entries]));
        } else {
          setEntries(data.entries);
        }
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
    executeSearch,
    searchFromInput,
    loadMore
  };
}

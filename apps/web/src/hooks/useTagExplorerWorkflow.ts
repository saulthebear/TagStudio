import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type TagCoOccurrence,
  type TagStatResponse,
  type TagStatsResponse
} from "@tagstudio/api-client";

import { api } from "@/api/client";
import { type SearchRequest } from "@/hooks/useSearchWorkflow";

export type TagExplorerViewMode = "cloud" | "tree" | "list" | "graph";
export type TagSelectionMode = "AND" | "OR";

export type TagTreeNode = {
  tag: TagStatResponse;
  children: TagTreeNode[];
  depth: number;
};

type UseTagExplorerWorkflowArgs = {
  activeLibraryPath: string | null;
  isLibraryOpen: boolean;
  executeSearch: (request: SearchRequest) => Promise<void>;
  setSearchInput: (value: string) => void;
  onError: (message: string) => void;
  onClearError: () => void;
};

export type UseTagExplorerWorkflowResult = {
  tags: TagStatResponse[];
  coOccurrences: TagCoOccurrence[];
  loading: boolean;
  selectedTagIds: Set<number>;
  selectedTagsList: TagStatResponse[];
  selectionMode: TagSelectionMode;
  viewMode: TagExplorerViewMode;
  tagSearchFilter: string;
  coOccurringTagIds: Set<number>;
  tagTree: TagTreeNode[];
  filteredTags: TagStatResponse[];
  toggleTag: (tagId: number) => void;
  selectTag: (tagId: number) => void;
  deselectTag: (tagId: number) => void;
  clearSelectedTags: () => void;
  setSelectionMode: (mode: TagSelectionMode) => void;
  setViewMode: (mode: TagExplorerViewMode) => void;
  setTagSearchFilter: (filter: string) => void;
  reloadTagStats: () => Promise<void>;
};

export function buildSearchQueryFromTags(
  selectedTagIds: Set<number>,
  mode: TagSelectionMode
): string {
  if (selectedTagIds.size === 0) {
    return "";
  }
  const tagIds = Array.from(selectedTagIds);
  if (tagIds.length === 1) {
    return `tag_id:${tagIds[0]}`;
  }
  if (mode === "AND") {
    return tagIds.map((id) => `tag_id:${id}`).join(" ");
  }
  return tagIds.map((id) => `tag_id:${id}`).join(" OR ");
}

export function buildTagTree(
  tags: TagStatResponse[],
  searchFilter: string = ""
): TagTreeNode[] {
  const normalizedFilter = searchFilter.trim().toLowerCase();
  const tagMap = new Map<number, TagStatResponse>();
  for (const tag of tags) {
    tagMap.set(tag.id, tag);
  }

  // Find direct children for each tag
  const childrenMap = new Map<number, TagStatResponse[]>();
  const isChildSet = new Set<number>();

  for (const tag of tags) {
    for (const parentId of tag.parent_ids) {
      if (tagMap.has(parentId)) {
        isChildSet.add(tag.id);
        const existing = childrenMap.get(parentId) ?? [];
        existing.push(tag);
        childrenMap.set(parentId, existing);
      }
    }
  }

  function matchesFilter(tag: TagStatResponse): boolean {
    if (!normalizedFilter) return true;
    if (tag.name.toLowerCase().includes(normalizedFilter)) return true;
    if (tag.shorthand?.toLowerCase().includes(normalizedFilter)) return true;
    if (tag.aliases.some((alias) => alias.toLowerCase().includes(normalizedFilter))) return true;
    return false;
  }

  function buildNode(tag: TagStatResponse, depth: number, visited: Set<number>): TagTreeNode | null {
    if (visited.has(tag.id)) {
      // Avoid cyclic relationships
      return null;
    }
    const nextVisited = new Set(visited);
    nextVisited.add(tag.id);

    const childTags = childrenMap.get(tag.id) ?? [];
    const childNodes: TagTreeNode[] = [];
    for (const child of childTags) {
      const built = buildNode(child, depth + 1, nextVisited);
      if (built) {
        childNodes.push(built);
      }
    }

    const selfMatches = matchesFilter(tag);
    const hasMatchingDescendants = childNodes.length > 0;

    if (normalizedFilter && !selfMatches && !hasMatchingDescendants) {
      return null;
    }

    return {
      tag,
      children: childNodes,
      depth
    };
  }

  const rootNodes: TagTreeNode[] = [];
  for (const tag of tags) {
    // Root if no valid parent in library
    if (!isChildSet.has(tag.id)) {
      const node = buildNode(tag, 0, new Set());
      if (node) {
        rootNodes.push(node);
      }
    }
  }

  return rootNodes;
}

export function useTagExplorerWorkflow({
  activeLibraryPath,
  isLibraryOpen,
  executeSearch,
  setSearchInput,
  onError,
  onClearError
}: UseTagExplorerWorkflowArgs): UseTagExplorerWorkflowResult {
  const [statsData, setStatsData] = useState<TagStatsResponse>({
    tags: [],
    co_occurrences: []
  });
  const [loading, setLoading] = useState(false);
  const [selectedTagIds, setSelectedTagIds] = useState<Set<number>>(new Set());
  const [selectionMode, setSelectionMode] = useState<TagSelectionMode>("AND");
  const [viewMode, setViewMode] = useState<TagExplorerViewMode>("cloud");
  const [tagSearchFilter, setTagSearchFilter] = useState("");

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchTagStats = useCallback(async () => {
    if (!isLibraryOpen) {
      setStatsData({ tags: [], co_occurrences: [] });
      return;
    }
    setLoading(true);
    try {
      const data = await api.getTagStats(2000);
      setStatsData(data);
      onClearError();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Failed to load tag statistics.");
    } finally {
      setLoading(false);
    }
  }, [isLibraryOpen, onClearError, onError]);

  useEffect(() => {
    setSelectedTagIds(new Set());
    setTagSearchFilter("");
    void fetchTagStats();
  }, [activeLibraryPath, fetchTagStats]);

  // Build co-occurrence lookup map: tagId -> Map<otherTagId, sharedCount>
  const coOccurrenceMap = useMemo(() => {
    const map = new Map<number, Map<number, number>>();
    for (const co of statsData.co_occurrences) {
      if (!map.has(co.tag_id_a)) {
        map.set(co.tag_id_a, new Map());
      }
      if (!map.has(co.tag_id_b)) {
        map.set(co.tag_id_b, new Map());
      }
      map.get(co.tag_id_a)!.set(co.tag_id_b, co.shared_count);
      map.get(co.tag_id_b)!.set(co.tag_id_a, co.shared_count);
    }
    return map;
  }, [statsData.co_occurrences]);

  // Set of tag IDs that co-occur or have parent/child relationships with currently selected tags
  const coOccurringTagIds = useMemo(() => {
    if (selectedTagIds.size === 0) {
      return new Set<number>();
    }
    const result = new Set<number>();
    const tagMap = new Map(statsData.tags.map((t) => [t.id, t]));

    const isConnected = (candidateId: number, targetId: number): boolean => {
      if (coOccurrenceMap.get(targetId)?.has(candidateId)) return true;
      const candidate = tagMap.get(candidateId);
      if (candidate?.parent_ids.includes(targetId)) return true;
      const target = tagMap.get(targetId);
      if (target?.parent_ids.includes(candidateId)) return true;
      return false;
    };

    for (const tag of statsData.tags) {
      if (selectedTagIds.has(tag.id)) continue;

      if (selectionMode === "AND") {
        let connectedToAll = true;
        for (const selectedId of selectedTagIds) {
          if (!isConnected(tag.id, selectedId)) {
            connectedToAll = false;
            break;
          }
        }
        if (connectedToAll) {
          result.add(tag.id);
        }
      } else {
        let connectedToAny = false;
        for (const selectedId of selectedTagIds) {
          if (isConnected(tag.id, selectedId)) {
            connectedToAny = true;
            break;
          }
        }
        if (connectedToAny) {
          result.add(tag.id);
        }
      }
    }

    return result;
  }, [coOccurrenceMap, selectedTagIds, statsData.tags, selectionMode]);

  // List of selected tag objects
  const selectedTagsList = useMemo(() => {
    const tagMap = new Map(statsData.tags.map((t) => [t.id, t]));
    return Array.from(selectedTagIds)
      .map((id) => tagMap.get(id))
      .filter((t): t is TagStatResponse => t !== undefined);
  }, [selectedTagIds, statsData.tags]);

  // Filtered tags for cloud & list views
  const filteredTags = useMemo(() => {
    const normalizedFilter = tagSearchFilter.trim().toLowerCase();
    if (!normalizedFilter) {
      return statsData.tags;
    }
    return statsData.tags.filter((tag) => {
      if (tag.name.toLowerCase().includes(normalizedFilter)) return true;
      if (tag.shorthand?.toLowerCase().includes(normalizedFilter)) return true;
      if (tag.aliases.some((alias) => alias.toLowerCase().includes(normalizedFilter))) return true;
      return false;
    });
  }, [statsData.tags, tagSearchFilter]);

  // Hierarchical tag tree
  const tagTree = useMemo(() => {
    return buildTagTree(statsData.tags, tagSearchFilter);
  }, [statsData.tags, tagSearchFilter]);

  const executeSearchRef = useRef(executeSearch);
  useEffect(() => {
    executeSearchRef.current = executeSearch;
  }, [executeSearch]);

  const setSearchInputRef = useRef(setSearchInput);
  useEffect(() => {
    setSearchInputRef.current = setSearchInput;
  }, [setSearchInput]);

  const prevQueryRef = useRef<string | null>(null);

  // Auto-update query and trigger search ONLY when selectedTagIds or selectionMode actually changes
  useEffect(() => {
    const query = buildSearchQueryFromTags(selectedTagIds, selectionMode);
    if (prevQueryRef.current === null) {
      // First mount — track initial query without triggering extra search
      prevQueryRef.current = query;
      return;
    }

    if (query === prevQueryRef.current) {
      return;
    }
    prevQueryRef.current = query;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      setSearchInputRef.current(query);
      void executeSearchRef.current({
        query,
        pageIndex: 0,
        append: false
      });
    }, 150);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [selectedTagIds, selectionMode]);

  const toggleTag = useCallback((tagId: number) => {
    setSelectedTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(tagId)) {
        next.delete(tagId);
      } else {
        next.add(tagId);
      }
      return next;
    });
  }, []);

  const selectTag = useCallback((tagId: number) => {
    setSelectedTagIds((prev) => {
      if (prev.has(tagId)) return prev;
      const next = new Set(prev);
      next.add(tagId);
      return next;
    });
  }, []);

  const deselectTag = useCallback((tagId: number) => {
    setSelectedTagIds((prev) => {
      if (!prev.has(tagId)) return prev;
      const next = new Set(prev);
      next.delete(tagId);
      return next;
    });
  }, []);

  const clearSelectedTags = useCallback(() => {
    setSelectedTagIds(new Set());
  }, []);

  return {
    tags: statsData.tags,
    coOccurrences: statsData.co_occurrences,
    loading,
    selectedTagIds,
    selectedTagsList,
    selectionMode,
    viewMode,
    tagSearchFilter,
    coOccurringTagIds,
    tagTree,
    filteredTags,
    toggleTag,
    selectTag,
    deselectTag,
    clearSelectedTags,
    setSelectionMode,
    setViewMode,
    setTagSearchFilter,
    reloadTagStats: fetchTagStats
  };
}

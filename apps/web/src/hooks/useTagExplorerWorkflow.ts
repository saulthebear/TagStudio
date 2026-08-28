import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type TagCoOccurrence,
  type TagStatResponse,
  type TagStatsResponse
} from "@tagstudio/api-client";

import { api } from "@/api/client";
import { type SearchRequest } from "@/hooks/useSearchWorkflow";
import { type TagDirectorySubMode } from "@/components/TagDirectoryView";

export type TagExplorerViewMode = "cloud" | "directory" | "graph" | "tree" | "list";
export type TagSelectionMode = "AND" | "OR";
export type TagInteractionMode = "browse" | "edit";
export type TagSortOption = "count-desc" | "count-asc" | "name-asc" | "name-desc";

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
  interactionMode: TagInteractionMode;
  selectedTagIds: Set<number>;
  editSelectedTagIds: Set<number>;
  selectedTagsList: TagStatResponse[];
  editSelectedTagsList: TagStatResponse[];
  selectionMode: TagSelectionMode;
  viewMode: TagExplorerViewMode;
  tagDirectorySubMode: TagDirectorySubMode;
  tagSearchFilter: string;
  showHiddenTags: boolean;
  sortOption: TagSortOption;
  coOccurringTagIds: Set<number>;
  tagTree: TagTreeNode[];
  filteredTags: TagStatResponse[];
  editingTag: TagStatResponse | null;
  isMergeModalOpen: boolean;
  isBatchParentModalOpen: boolean;
  isBatchPropertiesModalOpen: boolean;
  isDuplicateScannerOpen: boolean;
  setInteractionMode: (mode: TagInteractionMode) => void;
  setTagDirectorySubMode: (subMode: TagDirectorySubMode) => void;
  setShowHiddenTags: (show: boolean) => void;
  setSortOption: (option: TagSortOption) => void;
  toggleTag: (tagId: number) => void;
  selectTag: (tagId: number) => void;
  deselectTag: (tagId: number) => void;
  clearSelectedTags: () => void;
  toggleEditSelectTag: (tagId: number) => void;
  selectAllVisibleEditTags: () => void;
  clearEditSelectedTags: () => void;
  setEditingTag: (tag: TagStatResponse | null) => void;
  setIsMergeModalOpen: (open: boolean) => void;
  setIsBatchParentModalOpen: (open: boolean) => void;
  setIsBatchPropertiesModalOpen: (open: boolean) => void;
  setIsDuplicateScannerOpen: (open: boolean) => void;
  setSelectionMode: (mode: TagSelectionMode) => void;
  setViewMode: (mode: TagExplorerViewMode) => void;
  setTagSearchFilter: (filter: string) => void;
  reloadTagStats: () => Promise<void>;
};

export function compareTagStats(
  a: TagStatResponse,
  b: TagStatResponse,
  sortOption: TagSortOption = "count-desc"
): number {
  switch (sortOption) {
    case "name-asc":
      return a.name.localeCompare(b.name);
    case "name-desc":
      return b.name.localeCompare(a.name);
    case "count-asc":
      return a.entry_count - b.entry_count || a.name.localeCompare(b.name);
    case "count-desc":
    default:
      return b.entry_count - a.entry_count || a.name.localeCompare(b.name);
  }
}

export function buildSearchQueryFromTags(
  selectedTagIds: Set<number>,
  mode: TagSelectionMode = "AND"
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

import { buildTagAncestryMap } from "@/lib/tag-workflows";
export { buildTagAncestryMap };

export function buildTagTree(
  tags: TagStatResponse[],
  searchFilter: string = "",
  showHidden: boolean = true,
  sortOption: TagSortOption = "count-desc"
): TagTreeNode[] {
  const normalizedFilter = searchFilter.trim().toLowerCase();
  const tagMap = new Map<number, TagStatResponse>();
  for (const tag of tags) {
    if (!showHidden && tag.is_hidden) continue;
    tagMap.set(tag.id, tag);
  }

  // Find direct children for each tag
  const childrenMap = new Map<number, TagStatResponse[]>();
  const isChildSet = new Set<number>();

  for (const tag of tagMap.values()) {
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

    const childTags = (childrenMap.get(tag.id) ?? []).slice().sort((a, b) => compareTagStats(a, b, sortOption));
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
  const rootTags = Array.from(tagMap.values())
    .filter((tag) => !isChildSet.has(tag.id))
    .sort((a, b) => compareTagStats(a, b, sortOption));

  for (const tag of rootTags) {
    const node = buildNode(tag, 0, new Set());
    if (node) {
      rootNodes.push(node);
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
  const [interactionMode, setInteractionMode] = useState<TagInteractionMode>("browse");
  const [selectedTagIds, setSelectedTagIds] = useState<Set<number>>(new Set());
  const [editSelectedTagIds, setEditSelectedTagIds] = useState<Set<number>>(new Set());
  const [selectionMode, setSelectionMode] = useState<TagSelectionMode>("AND");
  const [viewMode, setViewModeState] = useState<TagExplorerViewMode>("cloud");
  const [tagDirectorySubMode, setTagDirectorySubMode] = useState<TagDirectorySubMode>("flat");
  const [tagSearchFilter, setTagSearchFilter] = useState("");
  const [showHiddenTags, setShowHiddenTags] = useState(false);
  const [sortOption, setSortOption] = useState<TagSortOption>("count-desc");

  // Modals state
  const [editingTag, setEditingTag] = useState<TagStatResponse | null>(null);
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [isBatchParentModalOpen, setIsBatchParentModalOpen] = useState(false);
  const [isBatchPropertiesModalOpen, setIsBatchPropertiesModalOpen] = useState(false);
  const [isDuplicateScannerOpen, setIsDuplicateScannerOpen] = useState(false);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Normalize viewMode: if legacy "tree" or "list" passed, adapt to directory with corresponding subMode
  const setViewMode = useCallback((mode: TagExplorerViewMode) => {
    if (mode === "tree") {
      setViewModeState("directory");
      setTagDirectorySubMode("tree");
    } else if (mode === "list") {
      setViewModeState("directory");
      setTagDirectorySubMode("flat");
    } else {
      setViewModeState(mode);
    }
  }, []);

  const normalizedViewMode: TagExplorerViewMode = useMemo(() => {
    if (viewMode === "tree" || viewMode === "list") return "directory";
    return viewMode;
  }, [viewMode]);

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
    setEditSelectedTagIds(new Set());
    setTagSearchFilter("");
    setEditingTag(null);
    setIsMergeModalOpen(false);
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

  // Precompute ancestor and descendant maps for all tags
  const { ancestorMap, descendantMap } = useMemo(() => {
    return buildTagAncestryMap(statsData.tags);
  }, [statsData.tags]);

  // Co-occurring tags for current search selection
  const coOccurringTagIds = useMemo(() => {
    if (selectedTagIds.size === 0) {
      return new Set<number>();
    }
    const result = new Set<number>();

    const isConnected = (candidateId: number, targetId: number): boolean => {
      if (coOccurrenceMap.get(targetId)?.has(candidateId)) return true;
      if (ancestorMap.get(candidateId)?.has(targetId)) return true;
      if (descendantMap.get(candidateId)?.has(targetId)) return true;
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
  }, [coOccurrenceMap, selectedTagIds, statsData.tags, selectionMode, ancestorMap, descendantMap]);

  // List of selected tag objects in browse mode
  const selectedTagsList = useMemo(() => {
    const tagMap = new Map(statsData.tags.map((t) => [t.id, t]));
    return Array.from(selectedTagIds)
      .map((id) => tagMap.get(id))
      .filter((t): t is TagStatResponse => t !== undefined);
  }, [selectedTagIds, statsData.tags]);

  // List of selected tag objects in edit mode
  const editSelectedTagsList = useMemo(() => {
    const tagMap = new Map(statsData.tags.map((t) => [t.id, t]));
    return Array.from(editSelectedTagIds)
      .map((id) => tagMap.get(id))
      .filter((t): t is TagStatResponse => t !== undefined);
  }, [editSelectedTagIds, statsData.tags]);

  // Filtered tags for cloud & directory views (taking search filter and showHidden into account)
  const filteredTags = useMemo(() => {
    const normalizedFilter = tagSearchFilter.trim().toLowerCase();
    return statsData.tags.filter((tag) => {
      if (!showHiddenTags && tag.is_hidden) return false;
      if (!normalizedFilter) return true;
      if (tag.name.toLowerCase().includes(normalizedFilter)) return true;
      if (tag.shorthand?.toLowerCase().includes(normalizedFilter)) return true;
      if (tag.aliases.some((alias) => alias.toLowerCase().includes(normalizedFilter))) return true;
      return false;
    });
  }, [statsData.tags, tagSearchFilter, showHiddenTags]);

  // Hierarchical tag tree
  const tagTree = useMemo(() => {
    return buildTagTree(statsData.tags, tagSearchFilter, showHiddenTags, sortOption);
  }, [statsData.tags, tagSearchFilter, showHiddenTags, sortOption]);

  const executeSearchRef = useRef(executeSearch);
  useEffect(() => {
    executeSearchRef.current = executeSearch;
  }, [executeSearch]);

  const setSearchInputRef = useRef(setSearchInput);
  useEffect(() => {
    setSearchInputRef.current = setSearchInput;
  }, [setSearchInput]);

  const prevQueryRef = useRef<string | null>(null);

  // Auto-update query and trigger search in browse mode
  useEffect(() => {
    const query = buildSearchQueryFromTags(selectedTagIds, selectionMode);
    if (prevQueryRef.current === null) {
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
      if (next.has(tagId)) next.delete(tagId);
      else next.add(tagId);
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

  const toggleEditSelectTag = useCallback((tagId: number) => {
    setEditSelectedTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(tagId)) next.delete(tagId);
      else next.add(tagId);
      return next;
    });
  }, []);

  const selectAllVisibleEditTags = useCallback(() => {
    setEditSelectedTagIds(new Set(filteredTags.map((t) => t.id)));
  }, [filteredTags]);

  const clearEditSelectedTags = useCallback(() => {
    setEditSelectedTagIds(new Set());
  }, []);

  return {
    tags: statsData.tags,
    coOccurrences: statsData.co_occurrences,
    loading,
    interactionMode,
    selectedTagIds,
    editSelectedTagIds,
    selectedTagsList,
    editSelectedTagsList,
    selectionMode,
    viewMode: normalizedViewMode,
    tagDirectorySubMode,
    tagSearchFilter,
    showHiddenTags,
    sortOption,
    coOccurringTagIds,
    tagTree,
    filteredTags,
    editingTag,
    isMergeModalOpen,
    isBatchParentModalOpen,
    isBatchPropertiesModalOpen,
    isDuplicateScannerOpen,
    setInteractionMode,
    setTagDirectorySubMode,
    setShowHiddenTags,
    setSortOption,
    toggleTag,
    selectTag,
    deselectTag,
    clearSelectedTags,
    toggleEditSelectTag,
    selectAllVisibleEditTags,
    clearEditSelectedTags,
    setEditingTag,
    setIsMergeModalOpen,
    setIsBatchParentModalOpen,
    setIsBatchPropertiesModalOpen,
    setIsDuplicateScannerOpen,
    setSelectionMode,
    setViewMode,
    setTagSearchFilter,
    reloadTagStats: fetchTagStats
  };
}

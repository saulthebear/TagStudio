import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type EntryResponse,
  type EntrySummaryResponse,
  type FieldTypeResponse,
  type JobEventPayload,
  type PreviewResponse,
  type TagCreatePayload,
  type TagResponse,
  type TagUpdatePayload
} from "@tagstudio/api-client";

import { api } from "@/api/client";
import { type ExecuteSearchFn } from "@/hooks/useSearchWorkflow";

type UseInspectorWorkflowArgs = {
  activeLibraryPath: string | null;
  isLibraryOpen: boolean;
  activeQuery: string;
  executeSearch: ExecuteSearchFn;
  onError: (message: string) => void;
  onClearError: () => void;
};

type UseInspectorWorkflowResult = {
  selectedEntry: EntryResponse | null;
  selectedEntryId: number | null;
  preview: PreviewResponse | undefined;
  fieldDrafts: Record<string, string>;
  setFieldDraft: (fieldKey: string, value: string) => void;
  newFieldKey: string;
  setNewFieldKey: (value: string) => void;
  newFieldValue: string;
  setNewFieldValue: (value: string) => void;
  allTags: TagResponse[];
  fieldTypes: FieldTypeResponse[];
  tagsDisplay: string;
  updateFieldPending: boolean;
  tagMutationPending: boolean;
  tagEditPending: boolean;
  refreshPending: boolean;
  refreshStatus: JobEventPayload | null;
  selectEntry: (entryId: number) => void;
  clearSelection: () => void;
  saveField: (fieldKey: string, value: string) => void;
  applyField: () => void;
  refreshLibrary: () => void;
  refreshSelectedEntry: () => Promise<void>;
  addTagToEntries: (entryIds: number[], tagId: number) => Promise<void>;
  removeTagFromEntries: (entryIds: number[], tagId: number) => Promise<void>;
  createTag: (payload: TagCreatePayload) => Promise<TagResponse | null>;
  updateTag: (tagId: number, payload: TagUpdatePayload) => Promise<TagResponse | null>;
  reconcileSelectionWithEntries: (entries: EntrySummaryResponse[]) => void;
};

function buildFieldDrafts(entry: EntryResponse): Record<string, string> {
  const drafts: Record<string, string> = {};
  for (const field of entry.fields) {
    drafts[field.type_key] = String(field.value ?? "");
  }
  return drafts;
}

export function useInspectorWorkflow({
  activeLibraryPath,
  isLibraryOpen,
  activeQuery,
  executeSearch,
  onError,
  onClearError
}: UseInspectorWorkflowArgs): UseInspectorWorkflowResult {
  const queryClient = useQueryClient();
  const eventStreamRef = useRef<EventSource | null>(null);
  const prewarmedPreviewIdsRef = useRef<Set<number>>(new Set());

  const [selectedEntryId, setSelectedEntryId] = useState<number | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<EntryResponse | null>(null);
  const [fieldDrafts, setFieldDrafts] = useState<Record<string, string>>({});
  const [newFieldKey, setNewFieldKey] = useState("");
  const [newFieldValue, setNewFieldValue] = useState("");
  const [refreshStatus, setRefreshStatus] = useState<JobEventPayload | null>(null);

  const syncSearchResults = useCallback(async () => {
    await executeSearch({ query: activeQuery, pageIndex: 0, append: false });
  }, [activeQuery, executeSearch]);

  const refreshSelectedEntry = useCallback(async () => {
    if (!selectedEntryId) {
      setSelectedEntry(null);
      setFieldDrafts({});
      return;
    }

    const entry = await api.getEntry(selectedEntryId);
    setSelectedEntry(entry);
    setFieldDrafts(buildFieldDrafts(entry));
  }, [selectedEntryId]);

  useEffect(
    () => () => {
      eventStreamRef.current?.close();
    },
    []
  );

  useEffect(() => {
    eventStreamRef.current?.close();
    setSelectedEntryId(null);
    setSelectedEntry(null);
    setFieldDrafts({});
    setNewFieldKey("");
    setNewFieldValue("");
    setRefreshStatus(null);
    prewarmedPreviewIdsRef.current = new Set();
  }, [activeLibraryPath]);

  useEffect(() => {
    if (!selectedEntry) {
      return;
    }
    if (prewarmedPreviewIdsRef.current.has(selectedEntry.id)) {
      return;
    }
    prewarmedPreviewIdsRef.current.add(selectedEntry.id);
    void api
      .prewarmThumbnails({
        entry_ids: [selectedEntry.id],
        fit: "contain",
        kind: "preview",
        priority: "foreground"
      })
      .catch(() => {});
  }, [selectedEntry]);

  const fieldTypes = useQuery({
    queryKey: ["field-types", activeLibraryPath],
    queryFn: () => api.getFieldTypes(),
    enabled: isLibraryOpen
  });

  const allTags = useQuery({
    queryKey: ["tags", activeLibraryPath, "all"],
    queryFn: () => api.getTags(undefined, -1),
    enabled: isLibraryOpen
  });

  const preview = useQuery<PreviewResponse>({
    queryKey: ["preview", selectedEntryId],
    queryFn: () => api.getPreview(selectedEntryId!),
    enabled: selectedEntryId !== null
  });

  const loadEntry = useMutation({
    mutationFn: (entryId: number) => api.getEntry(entryId),
    onSuccess: (entry) => {
      onClearError();
      setSelectedEntry(entry);
      setFieldDrafts(buildFieldDrafts(entry));
    },
    onError: (error) => {
      onError(error instanceof Error ? error.message : "Unable to load entry.");
    }
  });

  const updateEntryField = useMutation({
    mutationFn: (payload: { entryId: number; fieldKey: string; value: string }) =>
      api.updateEntryField(payload.entryId, payload.fieldKey, payload.value),
    onSuccess: (entry) => {
      onClearError();
      setSelectedEntry(entry);
      setFieldDrafts(buildFieldDrafts(entry));
      queryClient.invalidateQueries({ queryKey: ["library-state"] });
    },
    onError: (error) => {
      onError(error instanceof Error ? error.message : "Failed to update field.");
    }
  });

  const addTagsMutation = useMutation({
    mutationFn: (payload: { entryIds: number[]; tagId: number }) =>
      api.addTagsToEntries(payload.entryIds, [payload.tagId]),
    onSuccess: async (_, payload) => {
      onClearError();
      if (selectedEntryId !== null && payload.entryIds.includes(selectedEntryId)) {
        await refreshSelectedEntry();
      }
      queryClient.invalidateQueries({ queryKey: ["tags"] });
      queryClient.invalidateQueries({ queryKey: ["library-state"] });
      await syncSearchResults();
    },
    onError: (error) => {
      onError(error instanceof Error ? error.message : "Failed to add tag.");
    }
  });

  const removeTagsMutation = useMutation({
    mutationFn: (payload: { entryIds: number[]; tagId: number }) =>
      api.removeTagsFromEntries(payload.entryIds, [payload.tagId]),
    onSuccess: async (_, payload) => {
      onClearError();
      if (selectedEntryId !== null && payload.entryIds.includes(selectedEntryId)) {
        await refreshSelectedEntry();
      }
      queryClient.invalidateQueries({ queryKey: ["library-state"] });
      await syncSearchResults();
    },
    onError: (error) => {
      onError(error instanceof Error ? error.message : "Failed to remove tag.");
    }
  });

  const createTagMutation = useMutation({
    mutationFn: (payload: TagCreatePayload) => api.createTag(payload),
    onSuccess: async () => {
      onClearError();
      queryClient.invalidateQueries({ queryKey: ["tags"] });
      await syncSearchResults();
    },
    onError: (error) => {
      onError(error instanceof Error ? error.message : "Failed to create tag.");
    }
  });

  const updateTagMutation = useMutation({
    mutationFn: (payload: { tagId: number; data: TagUpdatePayload }) =>
      api.updateTag(payload.tagId, payload.data),
    onSuccess: async () => {
      onClearError();
      if (selectedEntryId !== null) {
        await refreshSelectedEntry();
      }
      queryClient.invalidateQueries({ queryKey: ["tags"] });
      await syncSearchResults();
    },
    onError: (error) => {
      onError(error instanceof Error ? error.message : "Failed to update tag.");
    }
  });

  const refreshLibraryMutation = useMutation({
    mutationFn: () => api.startRefreshJob(),
    onSuccess: (job) => {
      onClearError();
      setRefreshStatus(null);
      eventStreamRef.current?.close();
      const source = new EventSource(api.getJobEventsUrl(job.job_id));
      eventStreamRef.current = source;

      const onEvent = (event: MessageEvent) => {
        const payload = JSON.parse(event.data) as JobEventPayload;
        setRefreshStatus(payload);

        if (payload.is_terminal) {
          source.close();
          queryClient.invalidateQueries({ queryKey: ["library-state"] });
          void executeSearch({ query: activeQuery, pageIndex: 0, append: false });
        }
      };

      source.addEventListener("job.started", onEvent as EventListener);
      source.addEventListener("job.progress", onEvent as EventListener);
      source.addEventListener("job.completed", onEvent as EventListener);
      source.addEventListener("job.failed", onEvent as EventListener);

      source.onerror = () => {
        source.close();
      };
    },
    onError: (error) => {
      onError(error instanceof Error ? error.message : "Unable to start refresh.");
    }
  });

  const selectEntry = useCallback(
    (entryId: number) => {
      setSelectedEntryId(entryId);
      loadEntry.mutate(entryId);
    },
    [loadEntry]
  );

  const clearSelection = useCallback(() => {
    setSelectedEntryId(null);
    setSelectedEntry(null);
    setFieldDrafts({});
    setNewFieldKey("");
    setNewFieldValue("");
  }, []);

  const setFieldDraft = useCallback((fieldKey: string, value: string) => {
    setFieldDrafts((prev) => ({
      ...prev,
      [fieldKey]: value
    }));
  }, []);

  const saveField = useCallback(
    (fieldKey: string, value: string) => {
      if (!selectedEntry) {
        return;
      }

      updateEntryField.mutate({ entryId: selectedEntry.id, fieldKey, value });
    },
    [selectedEntry, updateEntryField]
  );

  const applyField = useCallback(() => {
    if (!selectedEntry || !newFieldKey) {
      return;
    }

    updateEntryField.mutate({
      entryId: selectedEntry.id,
      fieldKey: newFieldKey,
      value: newFieldValue
    });
  }, [newFieldKey, newFieldValue, selectedEntry, updateEntryField]);

  const addTagToEntries = useCallback(
    async (entryIds: number[], tagId: number) => {
      if (entryIds.length === 0) {
        return;
      }
      await addTagsMutation.mutateAsync({ entryIds, tagId });
    },
    [addTagsMutation]
  );

  const removeTagFromEntries = useCallback(
    async (entryIds: number[], tagId: number) => {
      if (entryIds.length === 0) {
        return;
      }
      await removeTagsMutation.mutateAsync({ entryIds, tagId });
    },
    [removeTagsMutation]
  );

  const createTag = useCallback(
    async (payload: TagCreatePayload) => {
      try {
        return await createTagMutation.mutateAsync(payload);
      } catch {
        return null;
      }
    },
    [createTagMutation]
  );

  const updateTag = useCallback(
    async (tagId: number, payload: TagUpdatePayload) => {
      try {
        return await updateTagMutation.mutateAsync({ tagId, data: payload });
      } catch {
        return null;
      }
    },
    [updateTagMutation]
  );

  const refreshLibrary = useCallback(() => {
    refreshLibraryMutation.mutate();
  }, [refreshLibraryMutation]);

  const reconcileSelectionWithEntries = useCallback(
    (entries: EntrySummaryResponse[]) => {
      if (selectedEntryId === null) {
        return;
      }

      const stillPresent = entries.some((entry) => entry.id === selectedEntryId);
      if (stillPresent) {
        return;
      }

      clearSelection();
    },
    [clearSelection, selectedEntryId]
  );

  const tagsDisplay = useMemo(
    () =>
      selectedEntry?.tags
        .map((tag) => `${tag.name}${tag.shorthand ? ` (${tag.shorthand})` : ""}`)
        .join(", ") ?? "",
    [selectedEntry]
  );

  return {
    selectedEntry,
    selectedEntryId,
    preview: preview.data,
    fieldDrafts,
    setFieldDraft,
    newFieldKey,
    setNewFieldKey,
    newFieldValue,
    setNewFieldValue,
    allTags: allTags.data ?? [],
    fieldTypes: fieldTypes.data ?? [],
    tagsDisplay,
    updateFieldPending: updateEntryField.isPending,
    tagMutationPending: addTagsMutation.isPending || removeTagsMutation.isPending,
    tagEditPending: createTagMutation.isPending || updateTagMutation.isPending,
    refreshPending: refreshLibraryMutation.isPending,
    refreshStatus,
    selectEntry,
    clearSelection,
    saveField,
    applyField,
    refreshLibrary,
    refreshSelectedEntry,
    addTagToEntries,
    removeTagFromEntries,
    createTag,
    updateTag,
    reconcileSelectionWithEntries
  };
}

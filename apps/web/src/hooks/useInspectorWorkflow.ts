import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type EntryResponse,
  type EntrySummaryResponse,
  type FieldTypeResponse,
  type JobEventPayload,
  type PreviewResponse,
  type TagResponse
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
  preview: PreviewResponse | undefined;
  fieldDrafts: Record<string, string>;
  setFieldDraft: (fieldKey: string, value: string) => void;
  selectedTagId: string;
  setSelectedTagId: (value: string) => void;
  tagQuery: string;
  setTagQuery: (value: string) => void;
  newFieldKey: string;
  setNewFieldKey: (value: string) => void;
  newFieldValue: string;
  setNewFieldValue: (value: string) => void;
  tags: TagResponse[];
  fieldTypes: FieldTypeResponse[];
  tagsDisplay: string;
  addTagPending: boolean;
  updateFieldPending: boolean;
  refreshPending: boolean;
  refreshStatus: JobEventPayload | null;
  selectEntry: (entryId: number) => void;
  addSelectedTag: () => void;
  removeTagFromEntry: (tagId: number) => void;
  saveField: (fieldKey: string, value: string) => void;
  applyField: () => void;
  refreshLibrary: () => void;
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

  const [selectedEntry, setSelectedEntry] = useState<EntryResponse | null>(null);
  const [fieldDrafts, setFieldDrafts] = useState<Record<string, string>>({});
  const [selectedTagId, setSelectedTagId] = useState("");
  const [tagQuery, setTagQuery] = useState("");
  const [newFieldKey, setNewFieldKey] = useState("");
  const [newFieldValue, setNewFieldValue] = useState("");
  const [refreshStatus, setRefreshStatus] = useState<JobEventPayload | null>(null);

  useEffect(
    () => () => {
      eventStreamRef.current?.close();
    },
    []
  );

  useEffect(() => {
    eventStreamRef.current?.close();
    setSelectedEntry(null);
    setFieldDrafts({});
    setSelectedTagId("");
    setTagQuery("");
    setNewFieldKey("");
    setNewFieldValue("");
    setRefreshStatus(null);
  }, [activeLibraryPath]);

  const fieldTypes = useQuery({
    queryKey: ["field-types", activeLibraryPath],
    queryFn: () => api.getFieldTypes(),
    enabled: isLibraryOpen
  });

  const tags = useQuery({
    queryKey: ["tags", activeLibraryPath, tagQuery],
    queryFn: () => api.getTags(tagQuery),
    enabled: isLibraryOpen
  });

  const preview = useQuery<PreviewResponse>({
    queryKey: ["preview", selectedEntry?.id],
    queryFn: () => api.getPreview(selectedEntry!.id),
    enabled: selectedEntry !== null
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

  const addTagToEntry = useMutation({
    mutationFn: (payload: { entryId: number; tagId: number }) =>
      api.addTagsToEntries([payload.entryId], [payload.tagId]),
    onSuccess: async (_, payload) => {
      onClearError();
      const entry = await api.getEntry(payload.entryId);
      setSelectedEntry(entry);
      queryClient.invalidateQueries({ queryKey: ["tags"] });
      queryClient.invalidateQueries({ queryKey: ["library-state"] });
    },
    onError: (error) => {
      onError(error instanceof Error ? error.message : "Failed to add tag.");
    }
  });

  const removeTagFromEntryMutation = useMutation({
    mutationFn: (payload: { entryId: number; tagId: number }) =>
      api.removeTagsFromEntries([payload.entryId], [payload.tagId]),
    onSuccess: async (_, payload) => {
      onClearError();
      const entry = await api.getEntry(payload.entryId);
      setSelectedEntry(entry);
      queryClient.invalidateQueries({ queryKey: ["library-state"] });
    },
    onError: (error) => {
      onError(error instanceof Error ? error.message : "Failed to remove tag.");
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
      loadEntry.mutate(entryId);
    },
    [loadEntry]
  );

  const setFieldDraft = useCallback((fieldKey: string, value: string) => {
    setFieldDrafts((prev) => ({
      ...prev,
      [fieldKey]: value
    }));
  }, []);

  const addSelectedTag = useCallback(() => {
    if (!selectedEntry || !selectedTagId) {
      return;
    }

    addTagToEntry.mutate({ entryId: selectedEntry.id, tagId: Number(selectedTagId) });
  }, [addTagToEntry, selectedEntry, selectedTagId]);

  const removeTagFromEntry = useCallback(
    (tagId: number) => {
      if (!selectedEntry) {
        return;
      }

      removeTagFromEntryMutation.mutate({ entryId: selectedEntry.id, tagId });
    },
    [removeTagFromEntryMutation, selectedEntry]
  );

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

  const refreshLibrary = useCallback(() => {
    refreshLibraryMutation.mutate();
  }, [refreshLibraryMutation]);

  const reconcileSelectionWithEntries = useCallback((entries: EntrySummaryResponse[]) => {
    setSelectedEntry((prev) => {
      if (!prev) {
        return null;
      }

      return entries.some((entry) => entry.id === prev.id) ? prev : null;
    });
  }, []);

  const tagsDisplay = useMemo(
    () =>
      selectedEntry?.tags
        .map((tag) => `${tag.name}${tag.shorthand ? ` (${tag.shorthand})` : ""}`)
        .join(", ") ?? "",
    [selectedEntry]
  );

  return {
    selectedEntry,
    preview: preview.data,
    fieldDrafts,
    setFieldDraft,
    selectedTagId,
    setSelectedTagId,
    tagQuery,
    setTagQuery,
    newFieldKey,
    setNewFieldKey,
    newFieldValue,
    setNewFieldValue,
    tags: tags.data ?? [],
    fieldTypes: fieldTypes.data ?? [],
    tagsDisplay,
    addTagPending: addTagToEntry.isPending,
    updateFieldPending: updateEntryField.isPending,
    refreshPending: refreshLibraryMutation.isPending,
    refreshStatus,
    selectEntry,
    addSelectedTag,
    removeTagFromEntry,
    saveField,
    applyField,
    refreshLibrary,
    reconcileSelectionWithEntries
  };
}

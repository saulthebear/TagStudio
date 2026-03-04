import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type SortingMode } from "@tagstudio/api-client";

import { type SplitPaneState } from "@/components/SplitPane";
import { api } from "@/api/client";
import {
  buildLayoutUpdate,
  DEFAULT_DRAFT,
  DEFAULT_INSPECTOR_SPLIT,
  DEFAULT_MAIN_SPLIT,
  layoutToInspectorSplit,
  layoutToMainSplit,
  type MobilePane,
  type SettingsDraft
} from "@/hooks/workflowTypes";

type UseSettingsWorkflowArgs = {
  activeLibraryPath: string | null;
  isLibraryOpen: boolean;
  onError: (message: string) => void;
  onClearError: () => void;
};

type UseSettingsWorkflowResult = {
  sortingMode: SortingMode;
  setSortingMode: (value: SortingMode) => void;
  ascending: boolean;
  setAscending: (value: boolean) => void;
  showHiddenEntries: boolean;
  setShowHiddenEntries: (value: boolean) => void;
  pageSize: number;
  setPageSize: (value: number) => void;
  settingsDraft: SettingsDraft;
  setSettingsDraft: (value: SettingsDraft | ((prev: SettingsDraft) => SettingsDraft)) => void;
  settingsOpen: boolean;
  openSettings: () => void;
  closeSettings: () => void;
  savePending: boolean;
  saveSettingsDraft: () => Promise<SettingsDraft | null>;
  mainSplitState: SplitPaneState;
  setMainSplitState: (value: SplitPaneState) => void;
  inspectorSplitState: SplitPaneState;
  setInspectorSplitState: (value: SplitPaneState) => void;
  mobileActivePane: MobilePane;
  setMobileActivePane: (value: MobilePane) => void;
  settingsHydrated: boolean;
  settingsFetching: boolean;
};

export function useSettingsWorkflow({
  activeLibraryPath,
  isLibraryOpen,
  onError,
  onClearError
}: UseSettingsWorkflowArgs): UseSettingsWorkflowResult {
  const queryClient = useQueryClient();

  const [sortingMode, setSortingMode] = useState<SortingMode>(DEFAULT_DRAFT.sortingMode);
  const [ascending, setAscending] = useState(DEFAULT_DRAFT.ascending);
  const [showHiddenEntries, setShowHiddenEntries] = useState(DEFAULT_DRAFT.showHiddenEntries);
  const [pageSize, setPageSize] = useState(DEFAULT_DRAFT.pageSize);

  const [mainSplitState, setMainSplitState] = useState<SplitPaneState>(DEFAULT_MAIN_SPLIT);
  const [inspectorSplitState, setInspectorSplitState] = useState<SplitPaneState>(
    DEFAULT_INSPECTOR_SPLIT
  );
  const [mobileActivePane, setMobileActivePane] = useState<MobilePane>("grid");

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<SettingsDraft>(DEFAULT_DRAFT);
  const [settingsHydrated, setSettingsHydrated] = useState(false);

  const settingsQueryKey = useMemo(() => ["settings", activeLibraryPath] as const, [activeLibraryPath]);

  const settings = useQuery({
    queryKey: settingsQueryKey,
    queryFn: () => api.getSettings(),
    enabled: isLibraryOpen
  });

  useEffect(() => {
    setSettingsHydrated(false);
    if (!isLibraryOpen) {
      setSettingsOpen(false);
    }
  }, [activeLibraryPath, isLibraryOpen]);

  useEffect(() => {
    if (!settings.data) {
      return;
    }

    setSortingMode(settings.data.sorting_mode);
    setAscending(settings.data.ascending);
    setShowHiddenEntries(settings.data.show_hidden_entries);
    setPageSize(settings.data.page_size);
    setSettingsDraft({
      sortingMode: settings.data.sorting_mode,
      ascending: settings.data.ascending,
      showHiddenEntries: settings.data.show_hidden_entries,
      pageSize: settings.data.page_size
    });
    setMainSplitState(layoutToMainSplit(settings.data.layout));
    setInspectorSplitState(layoutToInspectorSplit(settings.data.layout));
    setMobileActivePane(settings.data.layout.mobile_active_pane);
    setSettingsHydrated(true);
  }, [settings.data]);

  const saveSettingsMutation = useMutation({
    mutationFn: (draft: SettingsDraft) =>
      api.updateSettings({
        sorting_mode: draft.sortingMode,
        ascending: draft.ascending,
        show_hidden_entries: draft.showHiddenEntries,
        page_size: draft.pageSize
      }),
    onSuccess: (nextSettings) => {
      onClearError();
      queryClient.setQueryData(settingsQueryKey, nextSettings);
      setSortingMode(nextSettings.sorting_mode);
      setAscending(nextSettings.ascending);
      setShowHiddenEntries(nextSettings.show_hidden_entries);
      setPageSize(nextSettings.page_size);
      setSettingsDraft({
        sortingMode: nextSettings.sorting_mode,
        ascending: nextSettings.ascending,
        showHiddenEntries: nextSettings.show_hidden_entries,
        pageSize: nextSettings.page_size
      });
      setSettingsOpen(false);
    },
    onError: (error) => {
      onError(error instanceof Error ? error.message : "Failed to save settings.");
    }
  });

  const layoutUpdate = useMemo(
    () => buildLayoutUpdate(mainSplitState, inspectorSplitState, mobileActivePane),
    [inspectorSplitState, mainSplitState, mobileActivePane]
  );

  useEffect(() => {
    if (!isLibraryOpen || !settingsHydrated) {
      return;
    }

    let cancelled = false;
    const timeout = window.setTimeout(() => {
      void api
        .updateSettings({ layout: layoutUpdate })
        .then((nextSettings) => {
          if (cancelled) {
            return;
          }
          queryClient.setQueryData(settingsQueryKey, nextSettings);
        })
        .catch((error) => {
          if (cancelled) {
            return;
          }
          onError(error instanceof Error ? error.message : "Failed to persist panel layout.");
        });
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [isLibraryOpen, layoutUpdate, onError, queryClient, settingsHydrated, settingsQueryKey]);

  const openSettings = useCallback(() => {
    setSettingsDraft({
      sortingMode,
      ascending,
      showHiddenEntries,
      pageSize
    });
    setSettingsOpen(true);
  }, [ascending, pageSize, showHiddenEntries, sortingMode]);

  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
  }, []);

  const saveSettingsDraft = useCallback(async (): Promise<SettingsDraft | null> => {
    try {
      const nextSettings = await saveSettingsMutation.mutateAsync(settingsDraft);
      return {
        sortingMode: nextSettings.sorting_mode,
        ascending: nextSettings.ascending,
        showHiddenEntries: nextSettings.show_hidden_entries,
        pageSize: nextSettings.page_size
      };
    } catch {
      return null;
    }
  }, [saveSettingsMutation, settingsDraft]);

  return {
    sortingMode,
    setSortingMode,
    ascending,
    setAscending,
    showHiddenEntries,
    setShowHiddenEntries,
    pageSize,
    setPageSize,
    settingsDraft,
    setSettingsDraft,
    settingsOpen,
    openSettings,
    closeSettings,
    savePending: saveSettingsMutation.isPending,
    saveSettingsDraft,
    mainSplitState,
    setMainSplitState,
    inspectorSplitState,
    setInspectorSplitState,
    mobileActivePane,
    setMobileActivePane,
    settingsHydrated,
    settingsFetching: settings.isFetching
  };
}

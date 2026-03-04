import {
  type EntrySummaryResponse,
  type LayoutSettings,
  type LayoutSettingsUpdateRequest,
  type SortingMode
} from "@tagstudio/api-client";

import { type SplitPaneState } from "@/components/SplitPane";

export type MobilePane = "grid" | "preview" | "metadata";

export type SearchOverrides = {
  sortingMode?: SortingMode;
  ascending?: boolean;
  showHiddenEntries?: boolean;
  pageSize?: number;
};

export type SettingsDraft = {
  sortingMode: SortingMode;
  ascending: boolean;
  showHiddenEntries: boolean;
  pageSize: number;
};

export const DEFAULT_MAIN_SPLIT: SplitPaneState = {
  ratio: 0.78,
  lastOpenRatio: 0.78,
  primaryCollapsed: false,
  secondaryCollapsed: false
};

export const DEFAULT_INSPECTOR_SPLIT: SplitPaneState = {
  ratio: 0.52,
  lastOpenRatio: 0.52,
  primaryCollapsed: false,
  secondaryCollapsed: false
};

export const DEFAULT_DRAFT: SettingsDraft = {
  sortingMode: "file.date_added",
  ascending: false,
  showHiddenEntries: false,
  pageSize: 200
};

export function dedupeEntries(entries: EntrySummaryResponse[]): EntrySummaryResponse[] {
  const seen = new Set<number>();
  const deduped: EntrySummaryResponse[] = [];

  for (const entry of entries) {
    if (!seen.has(entry.id)) {
      seen.add(entry.id);
      deduped.push(entry);
    }
  }

  return deduped;
}

export function layoutToMainSplit(layout: LayoutSettings | undefined): SplitPaneState {
  if (!layout) {
    return DEFAULT_MAIN_SPLIT;
  }

  return {
    ratio: layout.main_split_ratio,
    lastOpenRatio: layout.main_last_open_ratio,
    primaryCollapsed: layout.main_left_collapsed,
    secondaryCollapsed: layout.main_right_collapsed
  };
}

export function layoutToInspectorSplit(layout: LayoutSettings | undefined): SplitPaneState {
  if (!layout) {
    return DEFAULT_INSPECTOR_SPLIT;
  }

  return {
    ratio: layout.inspector_split_ratio,
    lastOpenRatio: layout.inspector_last_open_ratio,
    primaryCollapsed: layout.preview_collapsed,
    secondaryCollapsed: layout.metadata_collapsed
  };
}

export function buildLayoutUpdate(
  main: SplitPaneState,
  inspector: SplitPaneState,
  mobileActivePane: MobilePane
): LayoutSettingsUpdateRequest {
  return {
    main_split_ratio: main.ratio,
    main_last_open_ratio: main.lastOpenRatio,
    main_left_collapsed: main.primaryCollapsed,
    main_right_collapsed: main.secondaryCollapsed,
    inspector_split_ratio: inspector.ratio,
    inspector_last_open_ratio: inspector.lastOpenRatio,
    preview_collapsed: inspector.primaryCollapsed,
    metadata_collapsed: inspector.secondaryCollapsed,
    mobile_active_pane: mobileActivePane
  };
}

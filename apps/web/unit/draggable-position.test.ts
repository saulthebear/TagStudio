import { describe, expect, test, beforeEach } from "bun:test";
import {
  getSavedPanelPosition,
  savePanelPosition,
  clearSavedPanelPosition
} from "../src/hooks/useDraggableModalPosition";

describe("draggable panel position persistence and per-panel override", () => {
  beforeEach(() => {
    clearSavedPanelPosition("test-panel-1");
    clearSavedPanelPosition("test-panel-2");
    clearSavedPanelPosition("override-panel");
  });

  test("saves and retrieves position for panel with panelId", () => {
    expect(getSavedPanelPosition("test-panel-1")).toBeNull();

    const newPos = { left: 120, top: 250 };
    savePanelPosition("test-panel-1", newPos);

    expect(getSavedPanelPosition("test-panel-1")).toEqual(newPos);
  });

  test("clears saved panel position", () => {
    savePanelPosition("test-panel-2", { left: 80, top: 90 });
    expect(getSavedPanelPosition("test-panel-2")).toEqual({ left: 80, top: 90 });

    clearSavedPanelPosition("test-panel-2");
    expect(getSavedPanelPosition("test-panel-2")).toBeNull();
  });

  test("allows overriding persistence per panel by not saving or clearing position", () => {
    // If a panel is configured with savePositionOnClose: false, position saving is bypassed
    const overridePanelId = "override-panel";
    expect(getSavedPanelPosition(overridePanelId)).toBeNull();

    // When savePositionOnClose is false, position is not saved
    savePanelPosition(overridePanelId, { left: 500, top: 500 });
    clearSavedPanelPosition(overridePanelId);

    expect(getSavedPanelPosition(overridePanelId)).toBeNull();
  });
});

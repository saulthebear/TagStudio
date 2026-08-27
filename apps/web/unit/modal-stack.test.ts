import { describe, expect, test } from "bun:test";

describe("modal stack & dismissal hierarchy logic", () => {
  test("computes modal stack depth and topmost status accurately", () => {
    let stack: string[] = [];

    const register = (id: string) => {
      if (!stack.includes(id)) {
        stack = [...stack, id];
      }
    };

    const unregister = (id: string) => {
      stack = stack.filter((item) => item !== id);
    };

    const getStatus = (id: string, open: boolean) => {
      const depth = open ? stack.indexOf(id) : -1;
      return {
        depth,
        isTopmost: depth >= 0 && depth === stack.length - 1
      };
    };

    // Open add-tags modal
    register("modal-add-tags");
    expect(getStatus("modal-add-tags", true)).toEqual({ depth: 0, isTopmost: true });

    // Open tag-editor modal on top
    register("modal-tag-editor");
    expect(getStatus("modal-add-tags", true)).toEqual({ depth: 0, isTopmost: false });
    expect(getStatus("modal-tag-editor", true)).toEqual({ depth: 1, isTopmost: true });

    // Close tag-editor modal
    unregister("modal-tag-editor");
    expect(getStatus("modal-add-tags", true)).toEqual({ depth: 0, isTopmost: true });
    expect(getStatus("modal-tag-editor", false)).toEqual({ depth: -1, isTopmost: false });

    // Close add-tags modal
    unregister("modal-add-tags");
    expect(getStatus("modal-add-tags", false)).toEqual({ depth: -1, isTopmost: false });
    expect(stack.length).toBe(0);
  });

  test("handles multi-layer Escape dismissal in full-screen mode correctly", () => {
    // State machine simulation of full screen view with metadata drawer and modals
    type FullScreenState = {
      isFullScreen: boolean;
      metadataOpen: boolean;
      modalStack: string[];
    };

    const state: FullScreenState = {
      isFullScreen: true,
      metadataOpen: false,
      modalStack: []
    };

    const handleEscape = () => {
      if (state.modalStack.length > 0) {
        // Pop topmost modal
        state.modalStack = state.modalStack.slice(0, -1);
        return "closed-modal";
      }

      if (state.metadataOpen) {
        state.metadataOpen = false;
        return "closed-metadata";
      }

      if (state.isFullScreen) {
        state.isFullScreen = false;
        return "closed-fullscreen";
      }

      return "noop";
    };

    // 1. Enter full screen, open metadata drawer
    state.metadataOpen = true;

    // 2. Open Add Tags modal from metadata drawer
    state.modalStack.push("add-tags-modal");

    // 3. Open Create Tag editor from Add Tags modal
    state.modalStack.push("tag-editor-modal");

    // Press Escape 1: Closes Tag Editor Modal
    expect(handleEscape()).toBe("closed-modal");
    expect(state.modalStack).toEqual(["add-tags-modal"]);
    expect(state.metadataOpen).toBeTrue();
    expect(state.isFullScreen).toBeTrue();

    // Press Escape 2: Closes Add Tags Modal
    expect(handleEscape()).toBe("closed-modal");
    expect(state.modalStack).toEqual([]);
    expect(state.metadataOpen).toBeTrue();
    expect(state.isFullScreen).toBeTrue();

    // Press Escape 3: Closes Metadata Drawer
    expect(handleEscape()).toBe("closed-metadata");
    expect(state.modalStack).toEqual([]);
    expect(state.metadataOpen).toBeFalse();
    expect(state.isFullScreen).toBeTrue();

    // Press Escape 4: Exits Full Screen Mode
    expect(handleEscape()).toBe("closed-fullscreen");
    expect(state.modalStack).toEqual([]);
    expect(state.metadataOpen).toBeFalse();
    expect(state.isFullScreen).toBeFalse();
  });
});

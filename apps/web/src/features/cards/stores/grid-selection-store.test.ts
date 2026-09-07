import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createStoreResetter } from "@/test/store-helpers";

import { useGridSelectionStore } from "./grid-selection-store";

let resetStore: () => void;

beforeEach(() => {
  resetStore = createStoreResetter(useGridSelectionStore);
});

afterEach(() => {
  resetStore();
});

describe("useGridSelectionStore", () => {
  describe("toggleSelect", () => {
    it("adds an unselected copy to the selection", () => {
      useGridSelectionStore.getState().toggleSelect("copy-1");
      expect(useGridSelectionStore.getState().selected).toEqual(new Set(["copy-1"]));
    });

    it("removes an already-selected copy", () => {
      useGridSelectionStore.getState().toggleSelect("copy-1");
      useGridSelectionStore.getState().toggleSelect("copy-1");
      expect(useGridSelectionStore.getState().selected.size).toBe(0);
    });

    it("ignores optimistic temp-prefixed ids", () => {
      const before = useGridSelectionStore.getState();
      useGridSelectionStore.getState().toggleSelect("temp-1");
      expect(useGridSelectionStore.getState()).toBe(before);
      expect(useGridSelectionStore.getState().selected.has("temp-1")).toBe(false);
    });
  });

  describe("toggleStack", () => {
    it("selects all ids in the stack when none are selected", () => {
      useGridSelectionStore.getState().toggleStack(["copy-1", "copy-2"]);
      expect(useGridSelectionStore.getState().selected).toEqual(new Set(["copy-1", "copy-2"]));
    });

    it("deselects all ids in the stack when all are selected", () => {
      useGridSelectionStore.getState().toggleStack(["copy-1", "copy-2"]);
      useGridSelectionStore.getState().toggleStack(["copy-1", "copy-2"]);
      expect(useGridSelectionStore.getState().selected.size).toBe(0);
    });

    it("selects the remaining ids when only some are selected", () => {
      useGridSelectionStore.getState().toggleSelect("copy-1");
      useGridSelectionStore.getState().toggleStack(["copy-1", "copy-2"]);
      expect(useGridSelectionStore.getState().selected).toEqual(new Set(["copy-1", "copy-2"]));
    });

    it("filters out temp ids before deciding select-all-vs-clear", () => {
      useGridSelectionStore.getState().toggleStack(["copy-1", "temp-2"]);
      expect(useGridSelectionStore.getState().selected).toEqual(new Set(["copy-1"]));
    });

    it("does nothing when the stack contains only temp ids", () => {
      const before = useGridSelectionStore.getState();
      useGridSelectionStore.getState().toggleStack(["temp-1", "temp-2"]);
      expect(useGridSelectionStore.getState()).toBe(before);
    });

    it("does nothing for an empty array", () => {
      const before = useGridSelectionStore.getState();
      useGridSelectionStore.getState().toggleStack([]);
      expect(useGridSelectionStore.getState()).toBe(before);
    });
  });

  describe("toggleSelectAll", () => {
    it("selects all given ids when nothing is selected", () => {
      useGridSelectionStore.getState().toggleSelectAll(["copy-1", "copy-2", "copy-3"]);
      expect(useGridSelectionStore.getState().selected).toEqual(
        new Set(["copy-1", "copy-2", "copy-3"]),
      );
    });

    it("clears selection when the full set is already selected", () => {
      useGridSelectionStore.getState().toggleSelectAll(["copy-1", "copy-2"]);
      useGridSelectionStore.getState().toggleSelectAll(["copy-1", "copy-2"]);
      expect(useGridSelectionStore.getState().selected.size).toBe(0);
    });

    it("filters temp ids out of the target set", () => {
      useGridSelectionStore.getState().toggleSelectAll(["copy-1", "temp-2"]);
      expect(useGridSelectionStore.getState().selected).toEqual(new Set(["copy-1"]));
    });

    it("re-selects all when sizes match but ids differ (size-only comparison)", () => {
      useGridSelectionStore.getState().toggleSelect("copy-1");
      useGridSelectionStore.getState().toggleSelectAll(["copy-2"]);
      expect(useGridSelectionStore.getState().selected).toEqual(new Set());
    });

    it("selects nothing for an empty list", () => {
      useGridSelectionStore.getState().toggleSelectAll([]);
      expect(useGridSelectionStore.getState().selected.size).toBe(0);
    });
  });

  describe("addToSelection", () => {
    it("adds new ids to an existing selection", () => {
      useGridSelectionStore.getState().toggleSelect("copy-1");
      useGridSelectionStore.getState().addToSelection(["copy-2", "copy-3"]);
      expect(useGridSelectionStore.getState().selected).toEqual(
        new Set(["copy-1", "copy-2", "copy-3"]),
      );
    });

    it("is idempotent for already-selected ids", () => {
      useGridSelectionStore.getState().toggleSelect("copy-1");
      useGridSelectionStore.getState().addToSelection(["copy-1"]);
      expect(useGridSelectionStore.getState().selected).toEqual(new Set(["copy-1"]));
    });

    it("filters out temp ids", () => {
      useGridSelectionStore.getState().addToSelection(["copy-1", "temp-2"]);
      expect(useGridSelectionStore.getState().selected).toEqual(new Set(["copy-1"]));
    });

    it("does nothing when all ids are temp ids", () => {
      const before = useGridSelectionStore.getState();
      useGridSelectionStore.getState().addToSelection(["temp-1"]);
      expect(useGridSelectionStore.getState()).toBe(before);
    });

    it("does nothing for an empty array", () => {
      const before = useGridSelectionStore.getState();
      useGridSelectionStore.getState().addToSelection([]);
      expect(useGridSelectionStore.getState()).toBe(before);
    });
  });

  describe("clearSelection", () => {
    it("empties the selection", () => {
      useGridSelectionStore.getState().addToSelection(["copy-1", "copy-2"]);
      useGridSelectionStore.getState().clearSelection();
      expect(useGridSelectionStore.getState().selected.size).toBe(0);
    });

    it("is a no-op result when the selection is already empty", () => {
      useGridSelectionStore.getState().clearSelection();
      expect(useGridSelectionStore.getState().selected.size).toBe(0);
    });
  });
});

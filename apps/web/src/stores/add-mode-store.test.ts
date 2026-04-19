import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resetIdCounter, stubPrinting } from "@/test/factories";
import { createStoreResetter } from "@/test/store-helpers";

import { useAddModeStore } from "./add-mode-store";

let resetStore: () => void;

beforeEach(() => {
  resetStore = createStoreResetter(useAddModeStore);
  resetIdCounter();
});

afterEach(() => {
  resetStore();
});

describe("useAddModeStore", () => {
  describe("incrementPending", () => {
    it("creates a new entry with pendingCount 1", () => {
      const printing = stubPrinting({ id: "p1" });
      useAddModeStore.getState().incrementPending(printing);

      const entry = useAddModeStore.getState().addedItems.get("p1");
      expect(entry).toBeDefined();
      expect(entry?.pendingCount).toBe(1);
      expect(entry?.quantity).toBe(0);
      expect(entry?.copyIds).toEqual([]);
    });

    it("increments pendingCount for existing entries", () => {
      const printing = stubPrinting({ id: "p1" });
      useAddModeStore.getState().incrementPending(printing);
      useAddModeStore.getState().incrementPending(printing);

      expect(useAddModeStore.getState().addedItems.get("p1")?.pendingCount).toBe(2);
    });

    it("moves entry to the end of the map (most recently touched)", () => {
      const p1 = stubPrinting({ id: "p1" });
      const p2 = stubPrinting({ id: "p2" });

      useAddModeStore.getState().incrementPending(p1);
      useAddModeStore.getState().incrementPending(p2);
      useAddModeStore.getState().incrementPending(p1);

      const keys = [...useAddModeStore.getState().addedItems.keys()];
      expect(keys).toEqual(["p2", "p1"]);
    });
  });

  describe("decrementPending", () => {
    it("decrements pendingCount", () => {
      const printing = stubPrinting({ id: "p1" });
      useAddModeStore.getState().incrementPending(printing);
      useAddModeStore.getState().incrementPending(printing);
      useAddModeStore.getState().decrementPending("p1");

      expect(useAddModeStore.getState().addedItems.get("p1")?.pendingCount).toBe(1);
    });

    it("removes entry when both pending and quantity are 0", () => {
      const printing = stubPrinting({ id: "p1" });
      useAddModeStore.getState().incrementPending(printing);
      useAddModeStore.getState().decrementPending("p1");

      expect(useAddModeStore.getState().addedItems.has("p1")).toBe(false);
    });

    it("keeps entry when quantity > 0 even if pending reaches 0", () => {
      const printing = stubPrinting({ id: "p1" });
      useAddModeStore.getState().incrementPending(printing);
      useAddModeStore.getState().recordAdd(printing, "copy-1");
      useAddModeStore.getState().decrementPending("p1");

      const entry = useAddModeStore.getState().addedItems.get("p1");
      expect(entry).toBeDefined();
      expect(entry?.pendingCount).toBe(0);
      expect(entry?.quantity).toBe(1);
    });

    it("does nothing when entry does not exist", () => {
      const before = useAddModeStore.getState();
      useAddModeStore.getState().decrementPending("nonexistent");
      expect(useAddModeStore.getState()).toBe(before);
    });

    it("does nothing when pendingCount is already 0", () => {
      const printing = stubPrinting({ id: "p1" });
      useAddModeStore.getState().recordAdd(printing, "copy-1");

      const before = useAddModeStore.getState();
      useAddModeStore.getState().decrementPending("p1");
      expect(useAddModeStore.getState()).toBe(before);
    });
  });

  describe("recordAdd", () => {
    it("increments quantity and records copyId", () => {
      const printing = stubPrinting({ id: "p1" });
      useAddModeStore.getState().recordAdd(printing, "copy-1");

      const entry = useAddModeStore.getState().addedItems.get("p1");
      expect(entry?.quantity).toBe(1);
      expect(entry?.copyIds).toEqual(["copy-1"]);
    });

    it("accumulates multiple adds", () => {
      const printing = stubPrinting({ id: "p1" });
      useAddModeStore.getState().recordAdd(printing, "copy-1");
      useAddModeStore.getState().recordAdd(printing, "copy-2");

      const entry = useAddModeStore.getState().addedItems.get("p1");
      expect(entry?.quantity).toBe(2);
      expect(entry?.copyIds).toEqual(["copy-1", "copy-2"]);
    });
  });

  describe("recordUndo", () => {
    it("decrements quantity and removes last copyId", () => {
      const printing = stubPrinting({ id: "p1" });
      useAddModeStore.getState().recordAdd(printing, "copy-1");
      useAddModeStore.getState().recordAdd(printing, "copy-2");
      useAddModeStore.getState().recordUndo("p1");

      const entry = useAddModeStore.getState().addedItems.get("p1");
      expect(entry?.quantity).toBe(1);
      expect(entry?.copyIds).toEqual(["copy-1"]);
    });

    it("removes entry when last copy is undone and no pending", () => {
      const printing = stubPrinting({ id: "p1" });
      useAddModeStore.getState().recordAdd(printing, "copy-1");
      useAddModeStore.getState().recordUndo("p1");

      expect(useAddModeStore.getState().addedItems.has("p1")).toBe(false);
    });

    it("keeps entry when copies are gone but pending remains", () => {
      const printing = stubPrinting({ id: "p1" });
      useAddModeStore.getState().incrementPending(printing);
      useAddModeStore.getState().recordAdd(printing, "copy-1");
      useAddModeStore.getState().recordUndo("p1");

      const entry = useAddModeStore.getState().addedItems.get("p1");
      expect(entry).toBeDefined();
      expect(entry?.quantity).toBe(0);
      expect(entry?.pendingCount).toBe(1);
    });

    it("does nothing for unknown printingId", () => {
      const before = useAddModeStore.getState();
      useAddModeStore.getState().recordUndo("nonexistent");
      expect(useAddModeStore.getState()).toBe(before);
    });
  });

  describe("UI toggles", () => {
    it("toggleAddedList flips showAddedList", () => {
      expect(useAddModeStore.getState().showAddedList).toBe(false);
      useAddModeStore.getState().toggleAddedList();
      expect(useAddModeStore.getState().showAddedList).toBe(true);
      useAddModeStore.getState().toggleAddedList();
      expect(useAddModeStore.getState().showAddedList).toBe(false);
    });

    it("closeAddedList sets showAddedList to false", () => {
      useAddModeStore.getState().toggleAddedList();
      useAddModeStore.getState().closeAddedList();
      expect(useAddModeStore.getState().showAddedList).toBe(false);
    });

    it("openVariants sets popover position", () => {
      useAddModeStore.getState().openVariants("card-1", { top: 100, left: 200 });

      const state = useAddModeStore.getState();
      expect(state.variantPopover).toEqual({ cardId: "card-1", pos: { top: 100, left: 200 } });
    });

    it("closeVariants clears the popover", () => {
      useAddModeStore.getState().openVariants("card-1", { top: 0, left: 0 });
      useAddModeStore.getState().closeVariants();
      expect(useAddModeStore.getState().variantPopover).toBeNull();
    });

    it("openDisposePicker stores printing and position", () => {
      const printing = stubPrinting({ id: "p1" });
      useAddModeStore.getState().openDisposePicker(printing, { top: 50, left: 60 });

      const state = useAddModeStore.getState();
      expect(state.disposePicker?.printing.id).toBe("p1");
      expect(state.disposePicker?.pos).toEqual({ top: 50, left: 60 });
    });

    it("closeDisposePicker clears the picker", () => {
      const printing = stubPrinting({ id: "p1" });
      useAddModeStore.getState().openDisposePicker(printing, { top: 0, left: 0 });
      useAddModeStore.getState().closeDisposePicker();
      expect(useAddModeStore.getState().disposePicker).toBeNull();
    });
  });

  describe("reset", () => {
    it("clears all state", () => {
      const printing = stubPrinting({ id: "p1" });
      useAddModeStore.getState().recordAdd(printing, "copy-1");
      useAddModeStore.getState().toggleAddedList();
      useAddModeStore.getState().openVariants("card-1", { top: 0, left: 0 });
      useAddModeStore.getState().openDisposePicker(printing, { top: 0, left: 0 });

      useAddModeStore.getState().reset();

      const state = useAddModeStore.getState();
      expect(state.addedItems.size).toBe(0);
      expect(state.showAddedList).toBe(false);
      expect(state.variantPopover).toBeNull();
      expect(state.disposePicker).toBeNull();
    });
  });
});

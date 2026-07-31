import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resetIdCounter, stubPrinting } from "@/test/factories";
import { createStoreResetter } from "@/test/store-helpers";

import { useScanSessionStore } from "./scan-session-store";

let resetStore: () => void;

beforeEach(() => {
  resetStore = createStoreResetter(useScanSessionStore);
  resetIdCounter();
});

afterEach(() => {
  resetStore();
});

describe("useScanSessionStore", () => {
  describe("recordPending", () => {
    it("creates a row with the temp copy id pending", () => {
      const printing = stubPrinting({ id: "p1" });
      useScanSessionStore.getState().recordPending(printing, "temp-1");

      const row = useScanSessionStore.getState().rows.get("p1");
      expect(row?.copyIds).toEqual(["temp-1"]);
      expect(row?.pendingCount).toBe(1);
    });

    it("appends to an existing row and moves it to the end", () => {
      const first = stubPrinting({ id: "p1" });
      const second = stubPrinting({ id: "p2" });
      useScanSessionStore.getState().recordPending(first, "temp-1");
      useScanSessionStore.getState().recordPending(second, "temp-2");
      useScanSessionStore.getState().recordPending(first, "temp-3");

      const rows = useScanSessionStore.getState().rows;
      expect(rows.get("p1")?.copyIds).toEqual(["temp-1", "temp-3"]);
      expect([...rows.keys()]).toEqual(["p2", "p1"]);
    });
  });

  describe("confirmAdd", () => {
    it("swaps the temp id for the real copy id and clears pending", () => {
      const printing = stubPrinting({ id: "p1" });
      useScanSessionStore.getState().recordPending(printing, "temp-1");
      useScanSessionStore.getState().confirmAdd("p1", "temp-1", "copy-1");

      const row = useScanSessionStore.getState().rows.get("p1");
      expect(row?.copyIds).toEqual(["copy-1"]);
      expect(row?.pendingCount).toBe(0);
    });

    it("ignores unknown printings", () => {
      useScanSessionStore.getState().confirmAdd("missing", "temp-1", "copy-1");
      expect(useScanSessionStore.getState().rows.size).toBe(0);
    });
  });

  describe("dropPending", () => {
    it("removes a failed pending copy and deletes an emptied row", () => {
      const printing = stubPrinting({ id: "p1" });
      useScanSessionStore.getState().recordPending(printing, "temp-1");
      useScanSessionStore.getState().dropPending("p1", "temp-1");

      expect(useScanSessionStore.getState().rows.has("p1")).toBe(false);
    });

    it("keeps the row when other copies remain", () => {
      const printing = stubPrinting({ id: "p1" });
      useScanSessionStore.getState().recordPending(printing, "temp-1");
      useScanSessionStore.getState().confirmAdd("p1", "temp-1", "copy-1");
      useScanSessionStore.getState().recordPending(printing, "temp-2");
      useScanSessionStore.getState().dropPending("p1", "temp-2");

      const row = useScanSessionStore.getState().rows.get("p1");
      expect(row?.copyIds).toEqual(["copy-1"]);
      expect(row?.pendingCount).toBe(0);
    });
  });

  describe("removeCopy", () => {
    it("removes the named copy and deletes an emptied row", () => {
      const printing = stubPrinting({ id: "p1" });
      useScanSessionStore.getState().recordPending(printing, "temp-1");
      useScanSessionStore.getState().confirmAdd("p1", "temp-1", "copy-1");
      useScanSessionStore.getState().removeCopy("p1", "copy-1");

      expect(useScanSessionStore.getState().rows.has("p1")).toBe(false);
    });

    it("does nothing when the copy is not in the row", () => {
      const printing = stubPrinting({ id: "p1" });
      useScanSessionStore.getState().recordPending(printing, "temp-1");
      useScanSessionStore.getState().confirmAdd("p1", "temp-1", "copy-1");
      const before = useScanSessionStore.getState().rows;
      useScanSessionStore.getState().removeCopy("p1", "copy-other");

      expect(useScanSessionStore.getState().rows).toBe(before);
    });
  });

  describe("recordConfirmed", () => {
    it("restores a removed copy without touching pending", () => {
      const printing = stubPrinting({ id: "p1" });
      useScanSessionStore.getState().recordPending(printing, "temp-1");
      useScanSessionStore.getState().confirmAdd("p1", "temp-1", "copy-1");
      useScanSessionStore.getState().removeCopy("p1", "copy-1");
      useScanSessionStore.getState().recordConfirmed(printing, "copy-1");

      const row = useScanSessionStore.getState().rows.get("p1");
      expect(row?.copyIds).toEqual(["copy-1"]);
      expect(row?.pendingCount).toBe(0);
    });
  });

  describe("reset", () => {
    it("clears all rows", () => {
      useScanSessionStore.getState().recordPending(stubPrinting({ id: "p1" }), "temp-1");
      useScanSessionStore.getState().reset();
      expect(useScanSessionStore.getState().rows.size).toBe(0);
    });
  });
});

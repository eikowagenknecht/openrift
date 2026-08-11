import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resetIdCounter, stubPrinting } from "@/test/factories";
import { createStoreResetter } from "@/test/store-helpers";

import { sessionCountOf, useScanSessionStore } from "./scan-session-store";

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

    it("keeps the row when identify-only readings remain", () => {
      const printing = stubPrinting({ id: "p1" });
      useScanSessionStore.getState().recordIdentified(printing);
      useScanSessionStore.getState().recordPending(printing, "temp-1");
      useScanSessionStore.getState().dropPending("p1", "temp-1");

      const row = useScanSessionStore.getState().rows.get("p1");
      expect(row?.copyIds).toEqual([]);
      expect(row?.identifiedCount).toBe(1);
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

    it("keeps the row when identify-only readings remain", () => {
      const printing = stubPrinting({ id: "p1" });
      useScanSessionStore.getState().recordPending(printing, "temp-1");
      useScanSessionStore.getState().confirmAdd("p1", "temp-1", "copy-1");
      useScanSessionStore.getState().recordIdentified(printing);
      useScanSessionStore.getState().removeCopy("p1", "copy-1");

      const row = useScanSessionStore.getState().rows.get("p1");
      expect(row?.copyIds).toEqual([]);
      expect(row?.identifiedCount).toBe(1);
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

  describe("recordIdentified", () => {
    it("logs a card the session is not collecting, with no copy behind it", () => {
      const printing = stubPrinting({ id: "p1" });
      useScanSessionStore.getState().recordIdentified(printing);

      const row = useScanSessionStore.getState().rows.get("p1");
      expect(row?.copyIds).toEqual([]);
      expect(row?.pendingCount).toBe(0);
      expect(row?.identifiedCount).toBe(1);
    });

    it("counts a second reading of the same printing", () => {
      const printing = stubPrinting({ id: "p1" });
      useScanSessionStore.getState().recordIdentified(printing);
      useScanSessionStore.getState().recordIdentified(printing);

      const rows = useScanSessionStore.getState().rows;
      const row = rows.get("p1");
      expect(rows.size).toBe(1);
      expect(row?.identifiedCount).toBe(2);
      expect(row?.copyIds).toEqual([]);
      expect(row && sessionCountOf(row)).toBe(2);
    });

    it("moves an existing row to newest without disturbing its copies", () => {
      const first = stubPrinting({ id: "p1" });
      const second = stubPrinting({ id: "p2" });
      useScanSessionStore.getState().recordPending(first, "temp-1");
      useScanSessionStore.getState().recordPending(second, "temp-2");
      useScanSessionStore.getState().recordIdentified(first);

      expect([...useScanSessionStore.getState().rows.keys()]).toEqual(["p2", "p1"]);
      expect(useScanSessionStore.getState().rows.get("p1")?.copyIds).toEqual(["temp-1"]);
      expect(useScanSessionStore.getState().rows.get("p1")?.identifiedCount).toBe(1);
    });
  });

  describe("removeIdentified", () => {
    it("takes back one reading and deletes an emptied row", () => {
      const printing = stubPrinting({ id: "p1" });
      useScanSessionStore.getState().recordIdentified(printing);
      useScanSessionStore.getState().removeIdentified("p1");

      expect(useScanSessionStore.getState().rows.has("p1")).toBe(false);
    });

    it("decrements when more readings remain", () => {
      const printing = stubPrinting({ id: "p1" });
      useScanSessionStore.getState().recordIdentified(printing);
      useScanSessionStore.getState().recordIdentified(printing);
      useScanSessionStore.getState().removeIdentified("p1");

      expect(useScanSessionStore.getState().rows.get("p1")?.identifiedCount).toBe(1);
    });

    it("keeps the row when copies stand behind it", () => {
      const printing = stubPrinting({ id: "p1" });
      useScanSessionStore.getState().recordPending(printing, "temp-1");
      useScanSessionStore.getState().confirmAdd("p1", "temp-1", "copy-1");
      useScanSessionStore.getState().recordIdentified(printing);
      useScanSessionStore.getState().removeIdentified("p1");

      const row = useScanSessionStore.getState().rows.get("p1");
      expect(row?.identifiedCount).toBe(0);
      expect(row?.copyIds).toEqual(["copy-1"]);
    });

    it("does nothing for an unknown printing", () => {
      const printing = stubPrinting({ id: "p1" });
      useScanSessionStore.getState().recordIdentified(printing);
      const before = useScanSessionStore.getState().rows;
      useScanSessionStore.getState().removeIdentified("missing");

      expect(useScanSessionStore.getState().rows).toBe(before);
    });

    it("does nothing when the row has no readings", () => {
      const printing = stubPrinting({ id: "p1" });
      useScanSessionStore.getState().recordPending(printing, "temp-1");
      useScanSessionStore.getState().confirmAdd("p1", "temp-1", "copy-1");
      const before = useScanSessionStore.getState().rows;
      useScanSessionStore.getState().removeIdentified("p1");

      expect(useScanSessionStore.getState().rows).toBe(before);
    });

    it("does not count as a scan", () => {
      const printing = stubPrinting({ id: "p1" });
      useScanSessionStore.getState().recordIdentified(printing);
      useScanSessionStore.getState().removeIdentified("p1");

      expect(useScanSessionStore.getState().scans).toBe(1);
    });
  });

  describe("convertIdentifiedToPending", () => {
    it("moves a reading into a pending copy", () => {
      const printing = stubPrinting({ id: "p1" });
      useScanSessionStore.getState().recordIdentified(printing);
      useScanSessionStore.getState().convertIdentifiedToPending("p1", "temp-1");

      const row = useScanSessionStore.getState().rows.get("p1");
      expect(row?.copyIds).toEqual(["temp-1"]);
      expect(row?.pendingCount).toBe(1);
      expect(row?.identifiedCount).toBe(0);
    });

    it("leaves the row where it is in the list", () => {
      const first = stubPrinting({ id: "p1" });
      const second = stubPrinting({ id: "p2" });
      useScanSessionStore.getState().recordIdentified(first);
      useScanSessionStore.getState().recordIdentified(second);
      useScanSessionStore.getState().convertIdentifiedToPending("p1", "temp-1");

      expect([...useScanSessionStore.getState().rows.keys()]).toEqual(["p1", "p2"]);
    });

    it("converts one reading at a time", () => {
      const printing = stubPrinting({ id: "p1" });
      useScanSessionStore.getState().recordIdentified(printing);
      useScanSessionStore.getState().recordIdentified(printing);
      useScanSessionStore.getState().convertIdentifiedToPending("p1", "temp-1");

      const row = useScanSessionStore.getState().rows.get("p1");
      expect(row?.copyIds).toEqual(["temp-1"]);
      expect(row?.identifiedCount).toBe(1);
      expect(row && sessionCountOf(row)).toBe(2);
    });

    it("hands the converted copy over to confirmAdd", () => {
      const printing = stubPrinting({ id: "p1" });
      useScanSessionStore.getState().recordIdentified(printing);
      useScanSessionStore.getState().convertIdentifiedToPending("p1", "temp-1");
      useScanSessionStore.getState().confirmAdd("p1", "temp-1", "copy-1");

      const row = useScanSessionStore.getState().rows.get("p1");
      expect(row?.copyIds).toEqual(["copy-1"]);
      expect(row?.pendingCount).toBe(0);
      expect(row?.identifiedCount).toBe(0);
    });

    it("does nothing for an unknown printing", () => {
      const printing = stubPrinting({ id: "p1" });
      useScanSessionStore.getState().recordIdentified(printing);
      const before = useScanSessionStore.getState().rows;
      useScanSessionStore.getState().convertIdentifiedToPending("missing", "temp-1");

      expect(useScanSessionStore.getState().rows).toBe(before);
    });

    it("does nothing when the row has no readings left", () => {
      const printing = stubPrinting({ id: "p1" });
      useScanSessionStore.getState().recordPending(printing, "temp-1");
      const before = useScanSessionStore.getState().rows;
      useScanSessionStore.getState().convertIdentifiedToPending("p1", "temp-2");

      expect(useScanSessionStore.getState().rows).toBe(before);
    });

    it("does not count as a scan", () => {
      const printing = stubPrinting({ id: "p1" });
      useScanSessionStore.getState().recordIdentified(printing);
      useScanSessionStore.getState().convertIdentifiedToPending("p1", "temp-1");

      expect(useScanSessionStore.getState().scans).toBe(1);
    });
  });

  describe("revertConvertToPending", () => {
    it("puts the reading back when the add failed", () => {
      const printing = stubPrinting({ id: "p1" });
      useScanSessionStore.getState().recordIdentified(printing);
      useScanSessionStore.getState().convertIdentifiedToPending("p1", "temp-1");
      useScanSessionStore.getState().revertConvertToPending("p1", "temp-1");

      const row = useScanSessionStore.getState().rows.get("p1");
      expect(row?.copyIds).toEqual([]);
      expect(row?.pendingCount).toBe(0);
      expect(row?.identifiedCount).toBe(1);
    });

    it("leaves the row's other copies alone", () => {
      const printing = stubPrinting({ id: "p1" });
      useScanSessionStore.getState().recordPending(printing, "temp-1");
      useScanSessionStore.getState().confirmAdd("p1", "temp-1", "copy-1");
      useScanSessionStore.getState().recordIdentified(printing);
      useScanSessionStore.getState().convertIdentifiedToPending("p1", "temp-2");
      useScanSessionStore.getState().revertConvertToPending("p1", "temp-2");

      const row = useScanSessionStore.getState().rows.get("p1");
      expect(row?.copyIds).toEqual(["copy-1"]);
      expect(row?.identifiedCount).toBe(1);
    });

    it("floors the pending count at zero", () => {
      const printing = stubPrinting({ id: "p1" });
      useScanSessionStore.getState().recordIdentified(printing);
      useScanSessionStore.getState().convertIdentifiedToPending("p1", "temp-1");
      useScanSessionStore.getState().confirmAdd("p1", "temp-1", "copy-1");
      useScanSessionStore.getState().revertConvertToPending("p1", "copy-1");

      const row = useScanSessionStore.getState().rows.get("p1");
      expect(row?.pendingCount).toBe(0);
      expect(row?.identifiedCount).toBe(1);
    });

    it("does nothing for an unknown printing", () => {
      const printing = stubPrinting({ id: "p1" });
      useScanSessionStore.getState().recordIdentified(printing);
      useScanSessionStore.getState().convertIdentifiedToPending("p1", "temp-1");
      const before = useScanSessionStore.getState().rows;
      useScanSessionStore.getState().revertConvertToPending("missing", "temp-1");

      expect(useScanSessionStore.getState().rows).toBe(before);
    });

    it("does nothing when the copy is not in the row", () => {
      const printing = stubPrinting({ id: "p1" });
      useScanSessionStore.getState().recordIdentified(printing);
      useScanSessionStore.getState().convertIdentifiedToPending("p1", "temp-1");
      const before = useScanSessionStore.getState().rows;
      useScanSessionStore.getState().revertConvertToPending("p1", "temp-other");

      expect(useScanSessionStore.getState().rows).toBe(before);
    });

    it("does not count as a scan", () => {
      const printing = stubPrinting({ id: "p1" });
      useScanSessionStore.getState().recordIdentified(printing);
      useScanSessionStore.getState().convertIdentifiedToPending("p1", "temp-1");
      useScanSessionStore.getState().revertConvertToPending("p1", "temp-1");

      expect(useScanSessionStore.getState().scans).toBe(1);
    });
  });

  describe("sessionCountOf", () => {
    it("sums copies and identify-only readings", () => {
      const printing = stubPrinting({ id: "p1" });
      useScanSessionStore.getState().recordPending(printing, "temp-1");
      useScanSessionStore.getState().confirmAdd("p1", "temp-1", "copy-1");
      useScanSessionStore.getState().recordPending(printing, "temp-2");
      useScanSessionStore.getState().recordIdentified(printing);
      useScanSessionStore.getState().recordIdentified(printing);

      const row = useScanSessionStore.getState().rows.get("p1");
      expect(row && sessionCountOf(row)).toBe(4);
    });
  });

  describe("scans", () => {
    it("counts every recognised card, not every row", () => {
      const printing = stubPrinting({ id: "p1" });
      useScanSessionStore.getState().recordPending(printing, "temp-1");
      useScanSessionStore.getState().recordPending(printing, "temp-2");
      useScanSessionStore.getState().recordIdentified(stubPrinting({ id: "p2" }));

      expect(useScanSessionStore.getState().scans).toBe(3);
      expect(useScanSessionStore.getState().rows.size).toBe(2);
    });

    it("does not count a correction as a scan", () => {
      const printing = stubPrinting({ id: "p1" });
      useScanSessionStore.getState().recordPending(printing, "temp-1");
      useScanSessionStore.getState().confirmAdd("p1", "temp-1", "copy-1");
      useScanSessionStore.getState().removeCopy("p1", "copy-1");
      useScanSessionStore.getState().recordConfirmed(printing, "copy-1");

      expect(useScanSessionStore.getState().scans).toBe(1);
    });
  });

  describe("reset", () => {
    it("clears all rows and the scan count", () => {
      useScanSessionStore.getState().recordPending(stubPrinting({ id: "p1" }), "temp-1");
      useScanSessionStore.getState().reset();
      expect(useScanSessionStore.getState().rows.size).toBe(0);
      expect(useScanSessionStore.getState().scans).toBe(0);
    });
  });
});

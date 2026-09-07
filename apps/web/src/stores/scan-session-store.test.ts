import type { Printing } from "@openrift/shared";
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

const state = () => useScanSessionStore.getState();

describe("useScanSessionStore", () => {
  describe("add", () => {
    it("creates a row with a count of one", () => {
      state().add(stubPrinting({ id: "p1" }));

      expect(state().rows.get("p1")?.count).toBe(1);
      expect(state().scans).toBe(1);
    });

    it("counts a second reading of the same printing", () => {
      const printing = stubPrinting({ id: "p1" });
      state().add(printing);
      state().add(printing);

      expect(state().rows.size).toBe(1);
      expect(state().rows.get("p1")?.count).toBe(2);
      expect(state().scans).toBe(2);
    });

    it("moves an existing row to the end of the list", () => {
      const first = stubPrinting({ id: "p1" });
      state().add(first);
      state().add(stubPrinting({ id: "p2" }));
      state().add(first);

      expect([...state().rows.keys()]).toEqual(["p2", "p1"]);
    });

    it("stamps the scan time and clears the resumed banner", () => {
      useScanSessionStore.setState({ resumed: { cards: 3, lastScanAt: 42 } });
      state().add(stubPrinting({ id: "p1" }));

      expect(state().resumed).toBeNull();
      expect(state().lastScanAt).not.toBeNull();
    });
  });

  describe("remove", () => {
    it("takes one off the count", () => {
      const printing = stubPrinting({ id: "p1" });
      state().add(printing);
      state().add(printing);
      state().remove("p1");

      expect(state().rows.get("p1")?.count).toBe(1);
    });

    it("deletes a row that reaches zero", () => {
      state().add(stubPrinting({ id: "p1" }));
      state().remove("p1");

      expect(state().rows.has("p1")).toBe(false);
    });

    it("leaves the row where it is in the list", () => {
      const first = stubPrinting({ id: "p1" });
      state().add(first);
      state().add(first);
      state().add(stubPrinting({ id: "p2" }));
      state().remove("p1");

      expect([...state().rows.keys()]).toEqual(["p1", "p2"]);
    });

    it("does nothing for an unknown printing", () => {
      state().add(stubPrinting({ id: "p1" }));
      const before = state().rows;
      state().remove("missing");

      expect(state().rows).toBe(before);
    });

    it("does not count as a scan", () => {
      state().add(stubPrinting({ id: "p1" }));
      state().remove("p1");

      expect(state().scans).toBe(1);
    });
  });

  describe("move", () => {
    it("takes one off the source and adds one to a new printing", () => {
      state().add(stubPrinting({ id: "p1" }));
      state().move("p1", stubPrinting({ id: "p2" }));

      expect(state().rows.has("p1")).toBe(false);
      expect(state().rows.get("p2")?.count).toBe(1);
    });

    it("takes the source row's place when the source empties", () => {
      state().add(stubPrinting({ id: "p1" }));
      state().add(stubPrinting({ id: "p3" }));
      state().move("p1", stubPrinting({ id: "p2" }));

      expect([...state().rows.keys()]).toEqual(["p2", "p3"]);
    });

    it("appends the target when the source still has copies", () => {
      const first = stubPrinting({ id: "p1" });
      state().add(first);
      state().add(first);
      state().add(stubPrinting({ id: "p3" }));
      state().move("p1", stubPrinting({ id: "p2" }));

      expect([...state().rows.keys()]).toEqual(["p1", "p3", "p2"]);
      expect(state().rows.get("p1")?.count).toBe(1);
    });

    it("merges into an existing target row without moving it", () => {
      state().add(stubPrinting({ id: "p1" }));
      state().add(stubPrinting({ id: "p2" }));
      state().add(stubPrinting({ id: "p3" }));
      state().move("p3", stubPrinting({ id: "p1" }));

      expect([...state().rows.keys()]).toEqual(["p1", "p2"]);
      expect(state().rows.get("p1")?.count).toBe(2);
    });

    it("merges into an existing target and drops the emptied source in one call", () => {
      state().add(stubPrinting({ id: "p1" }));
      state().add(stubPrinting({ id: "p2" }));
      state().add(stubPrinting({ id: "p3" }));
      state().move("p2", stubPrinting({ id: "p3" }));

      expect([...state().rows.keys()]).toEqual(["p1", "p3"]);
      expect(state().rows.get("p3")?.count).toBe(2);
      expect(state().rows.has("p2")).toBe(false);
    });

    it("does nothing for an unknown source or a move onto itself", () => {
      state().add(stubPrinting({ id: "p1" }));
      const before = state().rows;
      state().move("missing", stubPrinting({ id: "p2" }));
      state().move("p1", stubPrinting({ id: "p1" }));

      expect(state().rows).toBe(before);
    });

    it("does not count as a scan", () => {
      state().add(stubPrinting({ id: "p1" }));
      state().move("p1", stubPrinting({ id: "p2" }));

      expect(state().scans).toBe(1);
    });
  });

  describe("take", () => {
    it("empties the list when every copy was confirmed", () => {
      const first = stubPrinting({ id: "p1" });
      state().add(first);
      state().add(first);
      state().add(stubPrinting({ id: "p2" }));
      state().take(
        new Map([
          ["p1", 2],
          ["p2", 1],
        ]),
      );

      expect(state().rows.size).toBe(0);
    });

    it("keeps what the server did not confirm", () => {
      const first = stubPrinting({ id: "p1" });
      state().add(first);
      state().add(first);
      state().add(stubPrinting({ id: "p2" }));
      state().take(new Map([["p1", 1]]));

      expect(state().rows.get("p1")?.count).toBe(1);
      expect(state().rows.get("p2")?.count).toBe(1);
    });

    it("ignores counts for printings that left the list", () => {
      state().add(stubPrinting({ id: "p1" }));
      state().take(
        new Map([
          ["p1", 1],
          ["p-gone", 4],
        ]),
      );

      expect(state().rows.size).toBe(0);
      expect(state().rows.has("p-gone")).toBe(false);
    });

    it("keeps copies scanned after the snapshot was taken", () => {
      const printing = stubPrinting({ id: "p1" });
      state().add(printing);
      const confirmed = new Map([["p1", 1]]);
      state().add(printing);
      state().take(confirmed);

      expect(state().rows.get("p1")?.count).toBe(1);
    });
  });

  describe("putBack", () => {
    it("adds the counts back onto rows that are still there", () => {
      state().add(stubPrinting({ id: "p1" }));
      state().putBack([{ printing: stubPrinting({ id: "p1" }), count: 2 }]);

      expect(state().rows.get("p1")?.count).toBe(3);
    });

    it("appends missing rows in the order given", () => {
      state().add(stubPrinting({ id: "p1" }));
      state().putBack([
        { printing: stubPrinting({ id: "p2" }), count: 1 },
        { printing: stubPrinting({ id: "p3" }), count: 4 },
      ]);

      expect([...state().rows.keys()]).toEqual(["p1", "p2", "p3"]);
      expect(state().rows.get("p3")?.count).toBe(4);
    });

    it("ignores rows with nothing to put back", () => {
      state().putBack([{ printing: stubPrinting({ id: "p1" }), count: 0 }]);

      expect(state().rows.size).toBe(0);
    });

    it("does not count as a scan", () => {
      state().putBack([{ printing: stubPrinting({ id: "p1" }), count: 1 }]);

      expect(state().scans).toBe(0);
    });
  });

  describe("clear", () => {
    it("empties the list and hands back what was in it", () => {
      const first = stubPrinting({ id: "p1" });
      state().add(first);
      state().add(first);
      state().add(stubPrinting({ id: "p2" }));

      const cleared = state().clear();

      expect(state().rows.size).toBe(0);
      expect(cleared.map((row) => [row.printing.id, row.count])).toEqual([
        ["p1", 2],
        ["p2", 1],
      ]);
    });

    it("puts everything back through putBack", () => {
      state().add(stubPrinting({ id: "p1" }));
      state().add(stubPrinting({ id: "p2" }));
      const cleared = state().clear();
      state().putBack(cleared);

      expect([...state().rows.keys()]).toEqual(["p1", "p2"]);
    });

    it("dismisses the resumed banner", () => {
      useScanSessionStore.setState({ resumed: { cards: 2, lastScanAt: 42 } });
      state().clear();

      expect(state().resumed).toBeNull();
    });
  });

  describe("reset", () => {
    it("clears the rows, the scan count, the timestamp and any staged restore", () => {
      state().add(stubPrinting({ id: "p1" }));
      useScanSessionStore.setState({
        restored: { rows: [{ printingId: "p2", count: 1 }], scans: 1, lastScanAt: 42 },
      });
      state().reset();

      expect(state().rows.size).toBe(0);
      expect(state().scans).toBe(0);
      expect(state().lastScanAt).toBeNull();
      expect(state().restored).toBeNull();
    });
  });

  describe("persistence", () => {
    describe("partialize", () => {
      it("stores one entry per printing with its count", () => {
        const first = stubPrinting({ id: "p1" });
        state().add(first);
        state().add(first);
        state().add(stubPrinting({ id: "p2" }));

        const partialize = useScanSessionStore.persist.getOptions().partialize;
        const persisted = partialize?.(state());
        expect(persisted?.rows).toEqual([
          { printingId: "p1", count: 2 },
          { printingId: "p2", count: 1 },
        ]);
        expect(persisted?.scans).toBe(3);
        expect(persisted?.lastScanAt).not.toBeNull();
      });

      it("passes a staged payload through unchanged until restore runs", () => {
        const staged = {
          rows: [{ printingId: "p1", count: 2 }],
          scans: 3,
          lastScanAt: 123,
        };
        useScanSessionStore.setState({ restored: staged });
        const partialize = useScanSessionStore.persist.getOptions().partialize;
        expect(partialize?.(state())).toEqual(staged);
      });
    });

    describe("merge", () => {
      it("stages a valid persisted session for restore", () => {
        const merge = useScanSessionStore.persist.getOptions().merge;
        const merged = merge?.(
          { rows: [{ printingId: "p1", count: 2 }], scans: 3, lastScanAt: 42 },
          state(),
        );

        expect(merged?.restored).toEqual({
          rows: [{ printingId: "p1", count: 2 }],
          scans: 3,
          lastScanAt: 42,
        });
        expect(merged?.rows.size).toBe(0);
      });

      it("counts only the readings a copy-per-scan blob never wrote to a collection", () => {
        const merge = useScanSessionStore.persist.getOptions().merge;
        const merged = merge?.(
          {
            rows: [
              { printingId: "p1", copyIds: ["copy-1"], identifiedCount: 2 },
              { printingId: "p2", copyIds: ["copy-2", "copy-3"], identifiedCount: 0 },
            ],
            scans: 5,
            lastScanAt: 42,
          },
          state(),
        );

        expect(merged?.restored?.rows).toEqual([{ printingId: "p1", count: 2 }]);
      });

      it("filters malformed rows and stages nothing when none survive", () => {
        const merge = useScanSessionStore.persist.getOptions().merge;
        const merged = merge?.(
          {
            rows: [
              { printingId: 5, count: 1 },
              "junk",
              { printingId: "p1", count: "two" },
              { printingId: "p2", count: -1 },
              { printingId: "p3", count: 0 },
            ],
            scans: 1,
            lastScanAt: null,
          },
          state(),
        );

        expect(merged?.restored).toBeNull();
      });

      it("defaults a missing scans count to the row count", () => {
        const merge = useScanSessionStore.persist.getOptions().merge;
        const merged = merge?.({ rows: [{ printingId: "p1", count: 1 }] }, state());

        expect(merged?.restored?.scans).toBe(1);
        expect(merged?.restored?.lastScanAt).toBeNull();
      });

      it("survives a null persisted blob", () => {
        const merge = useScanSessionStore.persist.getOptions().merge;
        const current = state();
        expect(merge?.(null, current)).toBe(current);
      });
    });

    describe("restore", () => {
      const lookupFrom = (printings: Printing[]) => {
        const byId = new Map(printings.map((printing) => [printing.id, printing]));
        return (id: string) => byId.get(id);
      };

      it("rebuilds rows from the catalog and reports the banner data", () => {
        useScanSessionStore.setState({
          restored: {
            rows: [
              { printingId: "p1", count: 2 },
              { printingId: "p2", count: 3 },
            ],
            scans: 5,
            lastScanAt: 42,
          },
        });

        state().restore(lookupFrom([stubPrinting({ id: "p1" }), stubPrinting({ id: "p2" })]));

        expect(state().resumed).toEqual({ cards: 5, lastScanAt: 42 });
        expect([...state().rows.keys()]).toEqual(["p1", "p2"]);
        expect(state().rows.get("p1")?.count).toBe(2);
        expect(state().scans).toBe(5);
        expect(state().lastScanAt).toBe(42);
        expect(state().restored).toBeNull();
      });

      it("drops rows whose printing left the catalog", () => {
        useScanSessionStore.setState({
          restored: {
            rows: [
              { printingId: "p-gone", count: 1 },
              { printingId: "p1", count: 2 },
            ],
            scans: 3,
            lastScanAt: null,
          },
        });

        state().restore(lookupFrom([stubPrinting({ id: "p1" })]));

        expect(state().resumed).toEqual({ cards: 2, lastScanAt: null });
        expect([...state().rows.keys()]).toEqual(["p1"]);
      });

      it("keeps cards scanned before the restore as the newest rows", () => {
        const p1 = stubPrinting({ id: "p1" });
        const p2 = stubPrinting({ id: "p2" });
        state().add(p1);
        state().add(p2);
        useScanSessionStore.setState({
          restored: { rows: [{ printingId: "p1", count: 1 }], scans: 1, lastScanAt: 42 },
        });

        state().restore(lookupFrom([p1, p2]));

        expect([...state().rows.keys()]).toEqual(["p1", "p2"]);
        expect(state().rows.get("p1")?.count).toBe(2);
        expect(state().scans).toBe(3);
        expect(state().lastScanAt).not.toBe(42);
      });

      it("announces nothing when nothing was staged", () => {
        state().restore(() => undefined);
        expect(state().resumed).toBeNull();
      });

      it("announces nothing and clears the stage when no printing resolves", () => {
        useScanSessionStore.setState({
          restored: { rows: [{ printingId: "p-gone", count: 1 }], scans: 1, lastScanAt: 42 },
        });
        state().restore(() => undefined);

        expect(state().resumed).toBeNull();
        expect(state().restored).toBeNull();
      });

      it("clears the banner without touching the restored rows", () => {
        useScanSessionStore.setState({
          restored: { rows: [{ printingId: "p1", count: 1 }], scans: 1, lastScanAt: 42 },
        });
        state().restore(lookupFrom([stubPrinting({ id: "p1" })]));
        state().dismissResumed();

        expect(state().resumed).toBeNull();
        expect([...state().rows.keys()]).toEqual(["p1"]);
      });
    });
  });
});

import type { Printing } from "@openrift/shared";
import { describe, expect, it, vi } from "vitest";

import { buildOnDecrement } from "./route-decrement";

const printing = { id: "p1", cardId: "c1", setId: "set-ogn" } as Printing;

// Flush the async escalation IIFE inside onDecrement (await tryUndoAdd → maybe
// open the popover). Two microtask turns cover the single await plus its
// continuation.
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe("buildOnDecrement", () => {
  it("removes silently via tryUndoAdd in the non-ambiguous path", async () => {
    const tryUndoAdd = vi.fn().mockResolvedValue("done" as const);
    const handleOpenVariants = vi.fn();
    const anchor = document.createElement("button");

    const onDecrement = buildOnDecrement({
      dataView: "cards",
      groupBy: "none",
      ownedPrintingIdsByTile: new Map([["c1", ["p1"]]]),
      handleOpenVariants,
      tryUndoAdd,
    });
    onDecrement(printing, anchor);
    await flush();

    expect(tryUndoAdd).toHaveBeenCalledWith(printing);
    expect(handleOpenVariants).not.toHaveBeenCalled();
  });

  it("opens the popover instead of removing when copies span multiple variants in cards view", () => {
    const tryUndoAdd = vi.fn().mockResolvedValue("done" as const);
    const handleOpenVariants = vi.fn();
    const anchor = document.createElement("button");

    const onDecrement = buildOnDecrement({
      dataView: "cards",
      groupBy: "none",
      ownedPrintingIdsByTile: new Map([["c1", ["p1", "p2"]]]),
      handleOpenVariants,
      tryUndoAdd,
    });
    onDecrement(printing, anchor);

    expect(handleOpenVariants).toHaveBeenCalledWith(printing, anchor, "remove");
    expect(tryUndoAdd).not.toHaveBeenCalled();
  });

  it("escalates to the popover when tryUndoAdd reports a single variant spanning multiple collections", async () => {
    const tryUndoAdd = vi.fn().mockResolvedValue("ambiguous" as const);
    const handleOpenVariants = vi.fn();
    const anchor = document.createElement("button");

    const onDecrement = buildOnDecrement({
      dataView: "cards",
      groupBy: "none",
      ownedPrintingIdsByTile: new Map([["c1", ["p1"]]]),
      handleOpenVariants,
      tryUndoAdd,
    });
    onDecrement(printing, anchor);
    await flush();

    expect(tryUndoAdd).toHaveBeenCalledWith(printing);
    expect(handleOpenVariants).toHaveBeenCalledWith(printing, anchor, "remove");
  });

  it("does not escalate when ambiguous but no anchorEl (e.g. keyboard before tile lookup)", async () => {
    const tryUndoAdd = vi.fn().mockResolvedValue("ambiguous" as const);
    const handleOpenVariants = vi.fn();

    const onDecrement = buildOnDecrement({
      dataView: "cards",
      groupBy: "none",
      ownedPrintingIdsByTile: new Map([["c1", ["p1"]]]),
      handleOpenVariants,
      tryUndoAdd,
    });
    onDecrement(printing);
    await flush();

    expect(tryUndoAdd).toHaveBeenCalledWith(printing);
    expect(handleOpenVariants).not.toHaveBeenCalled();
  });

  it("buckets owned variants per tile when grouped by set", async () => {
    const ognTile = { id: "p1", cardId: "c1", setId: "set-ogn" } as Printing;
    const unlTile = { id: "p3", cardId: "c1", setId: "set-unl" } as Printing;
    const anchor = document.createElement("button");
    const ownedPrintingIdsByTile = new Map([
      ["c1|set-ogn", ["p1", "p2"]],
      ["c1|set-unl", ["p3"]],
    ]);

    const ognUndoAdd = vi.fn().mockResolvedValue("done" as const);
    const ognOpenVariants = vi.fn();
    buildOnDecrement({
      dataView: "cards",
      groupBy: "set",
      ownedPrintingIdsByTile,
      handleOpenVariants: ognOpenVariants,
      tryUndoAdd: ognUndoAdd,
    })(ognTile, anchor);
    expect(ognOpenVariants).toHaveBeenCalledWith(ognTile, anchor, "remove");
    expect(ognUndoAdd).not.toHaveBeenCalled();

    const unlUndoAdd = vi.fn().mockResolvedValue("done" as const);
    const unlOpenVariants = vi.fn();
    buildOnDecrement({
      dataView: "cards",
      groupBy: "set",
      ownedPrintingIdsByTile,
      handleOpenVariants: unlOpenVariants,
      tryUndoAdd: unlUndoAdd,
    })(unlTile, anchor);
    await flush();
    expect(unlOpenVariants).not.toHaveBeenCalled();
    expect(unlUndoAdd).toHaveBeenCalledWith(unlTile);
  });

  it("never opens the popover from the variant-count check in printings or copies view", async () => {
    const handleOpenVariants = vi.fn();
    const anchor = document.createElement("button");

    for (const dataView of ["printings", "copies"] as const) {
      const tryUndoAdd = vi.fn().mockResolvedValue("done" as const);
      handleOpenVariants.mockClear();
      const onDecrement = buildOnDecrement({
        dataView,
        groupBy: "none",
        ownedPrintingIdsByTile: new Map([["c1", ["p1", "p2"]]]),
        handleOpenVariants,
        tryUndoAdd,
      });
      onDecrement(printing, anchor);
      await flush();
      expect(handleOpenVariants).not.toHaveBeenCalled();
      expect(tryUndoAdd).toHaveBeenCalledWith(printing);
    }
  });
});

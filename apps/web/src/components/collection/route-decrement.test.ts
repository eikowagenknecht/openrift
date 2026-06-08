import type { Printing } from "@openrift/shared";
import { describe, expect, it, vi } from "vitest";

import { buildOnDecrement } from "./route-decrement";

const printing = { id: "p1", cardId: "c1", setId: "set-ogn" } as Printing;

describe("buildOnDecrement", () => {
  it("forwards anchorEl to handleUndoAdd in the non-ambiguous path", () => {
    // Regression: collection-grid previously dropped anchorEl when falling
    // through to handleUndoAdd, which meant the multi-collection picker
    // never opened on /collections without a specific collection scope.
    const handleUndoAdd = vi.fn();
    const handleOpenVariants = vi.fn();
    const anchor = document.createElement("button");

    const onDecrement = buildOnDecrement({
      dataView: "cards",
      groupBy: "none",
      ownedPrintingIdsByTile: new Map([["c1", ["p1"]]]),
      handleOpenVariants,
      handleUndoAdd,
    });
    onDecrement(printing, anchor);

    expect(handleOpenVariants).not.toHaveBeenCalled();
    expect(handleUndoAdd).toHaveBeenCalledWith(printing, anchor);
  });

  it("opens variants instead of decrementing when copies span multiple variants in cards view", () => {
    const handleUndoAdd = vi.fn();
    const handleOpenVariants = vi.fn();
    const anchor = document.createElement("button");

    const onDecrement = buildOnDecrement({
      dataView: "cards",
      groupBy: "none",
      ownedPrintingIdsByTile: new Map([["c1", ["p1", "p2"]]]),
      handleOpenVariants,
      handleUndoAdd,
    });
    onDecrement(printing, anchor);

    expect(handleOpenVariants).toHaveBeenCalledWith(printing, anchor, "remove");
    expect(handleUndoAdd).not.toHaveBeenCalled();
  });

  it("buckets owned variants per tile when grouped by set", () => {
    // Regression: a card reprinted in two sets must judge removal ambiguity per
    // set tile, not across the whole card. Owning two OGN printings and one UNL
    // printing means the OGN tile is ambiguous (open the variant picker) while
    // the UNL tile removes its single printing directly.
    const ognTile = { id: "p1", cardId: "c1", setId: "set-ogn" } as Printing;
    const unlTile = { id: "p3", cardId: "c1", setId: "set-unl" } as Printing;
    const anchor = document.createElement("button");
    const ownedPrintingIdsByTile = new Map([
      ["c1|set-ogn", ["p1", "p2"]],
      ["c1|set-unl", ["p3"]],
    ]);

    const ognUndoAdd = vi.fn();
    const ognOpenVariants = vi.fn();
    buildOnDecrement({
      dataView: "cards",
      groupBy: "set",
      ownedPrintingIdsByTile,
      handleOpenVariants: ognOpenVariants,
      handleUndoAdd: ognUndoAdd,
    })(ognTile, anchor);
    expect(ognOpenVariants).toHaveBeenCalledWith(ognTile, anchor, "remove");
    expect(ognUndoAdd).not.toHaveBeenCalled();

    const unlUndoAdd = vi.fn();
    const unlOpenVariants = vi.fn();
    buildOnDecrement({
      dataView: "cards",
      groupBy: "set",
      ownedPrintingIdsByTile,
      handleOpenVariants: unlOpenVariants,
      handleUndoAdd: unlUndoAdd,
    })(unlTile, anchor);
    expect(unlOpenVariants).not.toHaveBeenCalled();
    expect(unlUndoAdd).toHaveBeenCalledWith(unlTile, anchor);
  });

  it("falls back to handleUndoAdd when ambiguous but no anchorEl (e.g. keyboard before tile lookup)", () => {
    const handleUndoAdd = vi.fn();
    const handleOpenVariants = vi.fn();

    const onDecrement = buildOnDecrement({
      dataView: "cards",
      groupBy: "none",
      ownedPrintingIdsByTile: new Map([["c1", ["p1", "p2"]]]),
      handleOpenVariants,
      handleUndoAdd,
    });
    onDecrement(printing);

    expect(handleOpenVariants).not.toHaveBeenCalled();
    expect(handleUndoAdd).toHaveBeenCalledWith(printing, undefined);
  });

  it("never opens variants in printings or copies view", () => {
    const handleUndoAdd = vi.fn();
    const handleOpenVariants = vi.fn();
    const anchor = document.createElement("button");

    for (const dataView of ["printings", "copies"] as const) {
      handleUndoAdd.mockClear();
      handleOpenVariants.mockClear();
      const onDecrement = buildOnDecrement({
        dataView,
        groupBy: "none",
        ownedPrintingIdsByTile: new Map([["c1", ["p1", "p2"]]]),
        handleOpenVariants,
        handleUndoAdd,
      });
      onDecrement(printing, anchor);
      expect(handleOpenVariants).not.toHaveBeenCalled();
      expect(handleUndoAdd).toHaveBeenCalledWith(printing, anchor);
    }
  });
});

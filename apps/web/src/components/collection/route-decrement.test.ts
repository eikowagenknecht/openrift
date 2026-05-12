import type { Printing } from "@openrift/shared";
import { describe, expect, it, vi } from "vitest";

import { buildOnDecrement } from "./route-decrement";

const printing = { id: "p1", cardId: "c1" } as Printing;

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
      ownedPrintingIdsByCardId: new Map([["c1", ["p1"]]]),
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
      ownedPrintingIdsByCardId: new Map([["c1", ["p1", "p2"]]]),
      handleOpenVariants,
      handleUndoAdd,
    });
    onDecrement(printing, anchor);

    expect(handleOpenVariants).toHaveBeenCalledWith(printing, anchor);
    expect(handleUndoAdd).not.toHaveBeenCalled();
  });

  it("falls back to handleUndoAdd when ambiguous but no anchorEl (e.g. keyboard before tile lookup)", () => {
    const handleUndoAdd = vi.fn();
    const handleOpenVariants = vi.fn();

    const onDecrement = buildOnDecrement({
      dataView: "cards",
      ownedPrintingIdsByCardId: new Map([["c1", ["p1", "p2"]]]),
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
        ownedPrintingIdsByCardId: new Map([["c1", ["p1", "p2"]]]),
        handleOpenVariants,
        handleUndoAdd,
      });
      onDecrement(printing, anchor);
      expect(handleOpenVariants).not.toHaveBeenCalled();
      expect(handleUndoAdd).toHaveBeenCalledWith(printing, anchor);
    }
  });
});

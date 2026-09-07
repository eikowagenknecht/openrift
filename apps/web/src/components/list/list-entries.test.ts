import type { ListEntryDetailResponse, Printing } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import { EMPTY_TRADE_PREFERENCE, stubPrinting } from "@/test/factories";

import {
  collectListPrintings,
  kindToView,
  listCopyIds,
  resolveCopyMoveTarget,
  resolveEntryPrinting,
  selectableEntryIds,
} from "./list-entries";

const entryBase = {
  listId: "list-1",
  quantity: 1,
  tradeOverride: EMPTY_TRADE_PREFERENCE,
  source: "manual" as const,
  ruleQuantity: 0,
  cardName: "Test Card",
  cardType: "Unit",
};

const printingFields = {
  setId: "set-1",
  rarity: "common",
  finish: "normal",
  shortCode: "RB1-001",
  language: "EN",
  imageId: null,
};

function cardEntry(id: string, cardId: string): ListEntryDetailResponse {
  return { ...entryBase, id, kind: "card", cardId };
}

function printingEntry(id: string, printingId: string): ListEntryDetailResponse {
  return { ...entryBase, id, kind: "printing", printingId, ...printingFields };
}

function copyEntry(id: string | null, copyId: string, printingId: string): ListEntryDetailResponse {
  return {
    ...entryBase,
    id,
    kind: "copy",
    copyId,
    printingId,
    ...printingFields,
    reserved: false,
    onLoan: false,
  };
}

describe("kindToView", () => {
  it("maps each list kind to its view mode", () => {
    expect(kindToView("card")).toBe("cards");
    expect(kindToView("printing")).toBe("printings");
    expect(kindToView("copy")).toBe("copies");
  });
});

describe("resolveEntryPrinting", () => {
  const printing = stubPrinting({ id: "p1", cardId: "c1" });
  const printingsById: Record<string, Printing> = { p1: printing };
  const printingsByCardId = new Map([["c1", [printing]]]);

  it("resolves printing entries by printingId", () => {
    expect(resolveEntryPrinting(printingEntry("e1", "p1"), printingsById, printingsByCardId)).toBe(
      printing,
    );
  });

  it("resolves copy entries by the underlying printingId", () => {
    expect(
      resolveEntryPrinting(copyEntry("e1", "copy-1", "p1"), printingsById, printingsByCardId),
    ).toBe(printing);
  });

  it("resolves card entries to the card's first printing", () => {
    expect(resolveEntryPrinting(cardEntry("e1", "c1"), printingsById, printingsByCardId)).toBe(
      printing,
    );
  });

  it("returns undefined when nothing resolves", () => {
    expect(
      resolveEntryPrinting(printingEntry("e1", "missing"), printingsById, printingsByCardId),
    ).toBeUndefined();
    expect(
      resolveEntryPrinting(cardEntry("e1", "missing"), printingsById, printingsByCardId),
    ).toBeUndefined();
  });
});

describe("collectListPrintings", () => {
  const printingA = stubPrinting({ id: "pa", cardId: "ca" });
  const printingB = stubPrinting({ id: "pb", cardId: "cb" });
  const printingsById: Record<string, Printing> = { pa: printingA, pb: printingB };
  const printingsByCardId = new Map([
    ["ca", [printingA]],
    ["cb", [printingB]],
  ]);

  it("returns empty results for no entries", () => {
    const { listPrintings, entriesByPrintingId } = collectListPrintings(
      [],
      printingsById,
      printingsByCardId,
    );
    expect(listPrintings).toEqual([]);
    expect(entriesByPrintingId.size).toBe(0);
  });

  it("dedupes printings and groups entries per printing in entry order", () => {
    const first = printingEntry("e1", "pa");
    const second = copyEntry("e2", "copy-1", "pa");
    const third = printingEntry("e3", "pb");
    const { listPrintings, entriesByPrintingId } = collectListPrintings(
      [first, second, third],
      printingsById,
      printingsByCardId,
    );
    expect(listPrintings).toEqual([printingA, printingB]);
    expect(entriesByPrintingId.get("pa")).toEqual([first, second]);
    expect(entriesByPrintingId.get("pb")).toEqual([third]);
  });

  it("skips entries whose printing cannot be resolved", () => {
    const resolvable = cardEntry("e1", "ca");
    const unresolvable = printingEntry("e2", "missing");
    const { listPrintings, entriesByPrintingId } = collectListPrintings(
      [resolvable, unresolvable],
      printingsById,
      printingsByCardId,
    );
    expect(listPrintings).toEqual([printingA]);
    expect(entriesByPrintingId.size).toBe(1);
  });
});

describe("listCopyIds", () => {
  it("returns the copy ids of copy entries in list order", () => {
    const entries = [
      copyEntry("e1", "copy-1", "pa"),
      copyEntry(null, "copy-2", "pb"),
      copyEntry("e3", "copy-3", "pa"),
    ];
    expect(listCopyIds(entries)).toEqual(["copy-1", "copy-2", "copy-3"]);
  });

  it("returns nothing for lists without copies behind their entries", () => {
    expect(listCopyIds([cardEntry("e1", "ca"), printingEntry("e2", "pa")])).toEqual([]);
    expect(listCopyIds([])).toEqual([]);
  });
});

describe("selectableEntryIds", () => {
  const first = copyEntry("e1", "copy-1", "pa");
  const ruleProduced = copyEntry(null, "copy-2", "pb");
  const second = copyEntry("e3", "copy-3", "pc");

  it("returns one id per tile, in display order", () => {
    const items = [
      { id: "e1", printing: stubPrinting({ id: "pa" }) },
      { id: "e3", printing: stubPrinting({ id: "pc" }) },
    ];
    const entryByItemId = new Map([
      ["e1", first],
      ["e3", second],
    ]);
    expect(selectableEntryIds(items, entryByItemId)).toEqual(["e1", "e3"]);
  });

  it("skips rule-produced entries", () => {
    const items = [
      { id: "e1", printing: stubPrinting({ id: "pa" }) },
      { id: "copy-2", printing: stubPrinting({ id: "pb" }) },
    ];
    const entryByItemId = new Map([
      ["e1", first],
      ["copy-2", ruleProduced],
    ]);
    expect(selectableEntryIds(items, entryByItemId)).toEqual(["e1"]);
  });

  it("skips tiles with no entry behind them", () => {
    const items = [{ id: "pz", printing: stubPrinting({ id: "pz" }) }];
    expect(selectableEntryIds(items, new Map())).toEqual([]);
  });

  it("returns nothing for an empty grid", () => {
    expect(selectableEntryIds([], new Map())).toEqual([]);
  });
});

describe("resolveCopyMoveTarget", () => {
  const selectable = copyEntry("e1", "copy-1", "pa");
  const alsoSelectable = copyEntry("e2", "copy-2", "pb");
  const ruleProduced = copyEntry(null, "copy-3", "pa");
  const entries = [selectable, alsoSelectable, ruleProduced];

  it("targets just the clicked copy when nothing is selected", () => {
    expect(resolveCopyMoveTarget(entries, new Set(), "copy-1")).toEqual(["copy-1"]);
  });

  it("targets just the clicked copy when the selection does not contain it", () => {
    expect(resolveCopyMoveTarget(entries, new Set(["e2"]), "copy-1")).toEqual(["copy-1"]);
  });

  it("widens to the whole selection when the clicked copy is part of it", () => {
    const target = resolveCopyMoveTarget(entries, new Set(["e1", "e2"]), "copy-1");
    expect(target).toHaveLength(2);
    expect(new Set(target)).toEqual(new Set(["copy-1", "copy-2"]));
  });

  it("targets a rule-produced copy alone even while other entries are selected", () => {
    expect(resolveCopyMoveTarget(entries, new Set(["e1", "e2"]), "copy-3")).toEqual(["copy-3"]);
  });

  it("drops selected entries that have no copy behind them", () => {
    const mixed = [selectable, cardEntry("e9", "ca")];
    expect(resolveCopyMoveTarget(mixed, new Set(["e1", "e9"]), "copy-1")).toEqual(["copy-1"]);
  });

  it("falls back to the clicked copy when it is not on the list at all", () => {
    expect(resolveCopyMoveTarget(entries, new Set(["e1"]), "copy-unknown")).toEqual([
      "copy-unknown",
    ]);
  });
});

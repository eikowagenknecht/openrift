import type { ListEntryDetailResponse, Printing } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import { EMPTY_TRADE_PREFERENCE, stubPrinting } from "@/test/factories";

import { collectListPrintings, kindToView, resolveEntryPrinting } from "./list-entries";

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

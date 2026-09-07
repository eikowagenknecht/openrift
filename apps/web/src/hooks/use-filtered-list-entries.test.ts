import type { ListEntryDetailResponse, Printing } from "@openrift/shared";
import { renderHook } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";

import { EMPTY_TRADE_PREFERENCE, stubPrinting } from "@/test/factories";

// "Vi" has a normal and a foil printing so the card-kind resolution path
// has more than one candidate to pick from.
const viNormal = stubPrinting({ id: "p-vi", cardId: "card-vi", card: { name: "Vi" } });
const viFoil = stubPrinting({
  id: "p-vi-foil",
  cardId: "card-vi",
  finish: "foil",
  card: { name: "Vi" },
});
const jinx = stubPrinting({ id: "p-jinx", cardId: "card-jinx", card: { name: "Jinx" } });

vi.mock("@/hooks/use-cards", () => ({
  useCards: () => ({
    allPrintings: [viNormal, viFoil, jinx],
    printingsById: { [viNormal.id]: viNormal, [viFoil.id]: viFoil, [jinx.id]: jinx },
    printingsByCardId: new Map<string, Printing[]>([
      ["card-vi", [viNormal, viFoil]],
      ["card-jinx", [jinx]],
    ]),
    sets: [],
  }),
}));

vi.mock("@/hooks/use-keyword-reverse-map", () => ({
  useKeywordReverseMap: () => new Map<string, string[]>(),
}));

vi.mock("@/hooks/use-prices", () => ({
  usePrices: () => ({ get: () => undefined }),
}));

const { useFilteredListEntries } = await import("./use-filtered-list-entries");
const { FilterSearchProvider } = await import("@/lib/search-schemas");

const baseEntry = {
  listId: "list-1",
  ruleQuantity: 0,
  source: "manual",
  quantity: 1,
  tradeOverride: EMPTY_TRADE_PREFERENCE,
} as const;

function printingFields(printing: Printing) {
  return {
    setId: printing.setId,
    rarity: printing.rarity,
    finish: printing.finish,
    shortCode: printing.shortCode,
    language: printing.language,
    imageId: null,
  };
}

function cardEntry(id: string, cardId: string, cardName: string): ListEntryDetailResponse {
  return { ...baseEntry, id, kind: "card", cardId, cardName };
}

function printingEntry(id: string, printing: Printing, printingId?: string) {
  return {
    ...baseEntry,
    id,
    kind: "printing",
    printingId: printingId ?? printing.id,
    cardName: printing.card.name,
    ...printingFields(printing),
  } satisfies ListEntryDetailResponse;
}

function copyEntry(id: string, printing: Printing): ListEntryDetailResponse {
  return {
    ...printingEntry(id, printing),
    kind: "copy",
    copyId: `copy-${id}`,
    reserved: false,
    onLoan: false,
  };
}

function renderFiltered(
  entries: readonly ListEntryDetailResponse[],
  search: Record<string, unknown> = {},
) {
  return renderHook(() => useFilteredListEntries(entries), {
    wrapper: ({ children }) => createElement(FilterSearchProvider, { value: search }, children),
  });
}

const idsOf = (entries: readonly ListEntryDetailResponse[]) => entries.map((entry) => entry.id);

describe("useFilteredListEntries", () => {
  it("keeps every entry and reports no active filters when the URL carries none", () => {
    const entries = [printingEntry("e-1", viNormal), printingEntry("e-2", jinx)];

    const { result } = renderFiltered(entries);

    expect(result.current.hasActiveFilters).toBe(false);
    expect(result.current.filteredEntries).toEqual(entries);
  });

  it("drops entries whose card does not match the search text", () => {
    const entries = [printingEntry("e-1", viNormal), printingEntry("e-2", jinx)];

    const { result } = renderFiltered(entries, { search: "Jinx" });

    expect(result.current.hasActiveFilters).toBe(true);
    expect(idsOf(result.current.filteredEntries)).toEqual(["e-2"]);
  });

  it("applies a printing-level filter to the entry's own printing", () => {
    const entries = [printingEntry("e-1", viNormal), printingEntry("e-2", viFoil)];

    const { result } = renderFiltered(entries, { finishes: ["foil"] });

    expect(idsOf(result.current.filteredEntries)).toEqual(["e-2"]);
  });

  it("filters a card-kind entry through the card's first catalog printing", () => {
    const entries = [cardEntry("e-1", "card-vi", "Vi"), cardEntry("e-2", "card-jinx", "Jinx")];

    const { result } = renderFiltered(entries, { search: "Vi" });

    expect(idsOf(result.current.filteredEntries)).toEqual(["e-1"]);
  });

  it("keeps every copy of a surviving printing", () => {
    const entries = [
      copyEntry("e-1", viNormal),
      copyEntry("e-2", viNormal),
      copyEntry("e-3", jinx),
    ];

    const { result } = renderFiltered(entries, { search: "Vi" });

    expect(idsOf(result.current.filteredEntries)).toEqual(["e-1", "e-2"]);
  });

  it("drops entries whose printing is missing from the catalog", () => {
    const entries = [printingEntry("e-1", jinx, "p-gone"), printingEntry("e-2", jinx)];

    const { result } = renderFiltered(entries, { search: "Jinx" });

    expect(idsOf(result.current.filteredEntries)).toEqual(["e-2"]);
  });

  it("returns nothing when the filters match no entry on the list", () => {
    const entries = [printingEntry("e-1", viNormal)];

    const { result } = renderFiltered(entries, { search: "Ekko" });

    expect(result.current.filteredEntries).toEqual([]);
  });
});

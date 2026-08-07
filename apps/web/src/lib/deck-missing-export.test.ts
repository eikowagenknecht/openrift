import { beforeEach, describe, expect, it } from "vitest";

import { resetIdCounter, stubCardOwnership } from "@/test/factories";

import { missingCardsToListEntries, missingCardsToWants } from "./deck-missing-export";

beforeEach(() => {
  resetIdCounter();
});

describe("missingCardsToWants", () => {
  it("maps each missing row to a want with the shortfall as quantity", () => {
    const cards = [
      stubCardOwnership({ cardName: "Cleave", shortfall: 3 }),
      stubCardOwnership({ cardName: "Rally", shortfall: 1 }),
    ];
    expect(missingCardsToWants(cards)).toEqual([
      { name: "Cleave", quantity: 3 },
      { name: "Rally", quantity: 1 },
    ]);
  });

  it("keeps per-zone rows of the same card separate (merging is the formatter's job)", () => {
    const cards = [
      stubCardOwnership({ cardName: "Cleave", zone: "main", shortfall: 2 }),
      stubCardOwnership({ cardName: "Cleave", zone: "sideboard", shortfall: 1 }),
    ];
    expect(missingCardsToWants(cards)).toEqual([
      { name: "Cleave", quantity: 2 },
      { name: "Cleave", quantity: 1 },
    ]);
  });

  it("drops rows without a shortfall", () => {
    const cards = [stubCardOwnership({ cardName: "Owned Card", shortfall: 0 })];
    expect(missingCardsToWants(cards)).toEqual([]);
  });

  it("returns an empty array for no rows", () => {
    expect(missingCardsToWants([])).toEqual([]);
  });
});

describe("missingCardsToListEntries", () => {
  it("maps rows to cardId entries for card-kind lists", () => {
    const card = stubCardOwnership({ shortfall: 2 });
    expect(missingCardsToListEntries([card], "card")).toEqual([
      { cardId: card.cardId, quantity: 2 },
    ]);
  });

  it("maps rows to printingId entries for printing-kind lists", () => {
    const card = stubCardOwnership({ shortfall: 2 });
    expect(missingCardsToListEntries([card], "printing")).toEqual([
      { printingId: card.displayPrinting?.id, quantity: 2 },
    ]);
  });

  it("skips rows without a display printing for printing-kind lists", () => {
    const withPrinting = stubCardOwnership({ shortfall: 1 });
    const withoutPrinting = stubCardOwnership({ shortfall: 1, displayPrinting: undefined });
    expect(missingCardsToListEntries([withPrinting, withoutPrinting], "printing")).toEqual([
      { printingId: withPrinting.displayPrinting?.id, quantity: 1 },
    ]);
  });

  it("prefers the completion printing over the display printing for printing-kind lists", () => {
    const card = stubCardOwnership({
      shortfall: 1,
      completionPrinting: {
        id: "cheap-printing",
        language: "EN",
        shortCode: "OGN-002",
        rarity: "common",
        imageId: undefined,
        landscape: false,
      },
    });
    expect(missingCardsToListEntries([card], "printing")).toEqual([
      { printingId: "cheap-printing", quantity: 1 },
    ]);
  });

  it("keeps rows without a display printing for card-kind lists", () => {
    const card = stubCardOwnership({ shortfall: 1, displayPrinting: undefined });
    expect(missingCardsToListEntries([card], "card")).toEqual([
      { cardId: card.cardId, quantity: 1 },
    ]);
  });

  it("drops rows without a shortfall", () => {
    const card = stubCardOwnership({ shortfall: 0 });
    expect(missingCardsToListEntries([card], "card")).toEqual([]);
  });

  it("returns no entries for copy-kind lists", () => {
    const card = stubCardOwnership({ shortfall: 1 });
    expect(missingCardsToListEntries([card], "copy")).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";

import type { DeckCardSummaryInput, DeckSummaryOrders } from "./deck-list-summary";
import { isValidInDeckList, summarizeDeckCards } from "./deck-list-summary";
import type { DeckCard } from "./deck-rules";
import { WellKnown } from "./well-known";

const ORDERS: DeckSummaryOrders = {
  cardTypes: ["legend", "unit", "rune", "spell", "gear", "battlefield"],
  domains: ["fury", "calm", "mind", "body", "chaos", "order"],
};

function card(overrides: Partial<DeckCardSummaryInput> = {}): DeckCardSummaryInput {
  return {
    cardId: "card-1",
    zone: WellKnown.deckZone.MAIN,
    quantity: 1,
    cardTypes: ["unit"],
    domains: ["fury"],
    ...overrides,
  };
}

describe("summarizeDeckCards", () => {
  it("reports the first legend and champion card ids", () => {
    const stats = summarizeDeckCards(
      [
        card({ cardId: "legend-1", zone: WellKnown.deckZone.LEGEND, cardTypes: ["legend"] }),
        card({ cardId: "champ-1", zone: WellKnown.deckZone.CHAMPION }),
        card({ cardId: "champ-2", zone: WellKnown.deckZone.CHAMPION }),
      ],
      ORDERS,
    );
    expect(stats.legendCardId).toBe("legend-1");
    expect(stats.championCardId).toBe("champ-1");
  });

  it("reports null ids when the deck has no legend or champion", () => {
    const stats = summarizeDeckCards([card()], ORDERS);
    expect(stats.legendCardId).toBeNull();
    expect(stats.championCardId).toBeNull();
  });

  it("counts every zone except overflow toward the card total", () => {
    const stats = summarizeDeckCards(
      [
        card({ zone: WellKnown.deckZone.MAIN, quantity: 3 }),
        card({ zone: WellKnown.deckZone.SIDEBOARD, quantity: 2 }),
        card({ zone: WellKnown.deckZone.RUNES, quantity: 12 }),
        card({ zone: WellKnown.deckZone.OVERFLOW, quantity: 99 }),
      ],
      ORDERS,
    );
    expect(stats.totalCards).toBe(17);
  });

  it("counts types from the main and champion zones only", () => {
    const stats = summarizeDeckCards(
      [
        card({ zone: WellKnown.deckZone.MAIN, quantity: 2, cardTypes: ["unit"] }),
        card({ zone: WellKnown.deckZone.CHAMPION, quantity: 1, cardTypes: ["unit"] }),
        card({ zone: WellKnown.deckZone.SIDEBOARD, quantity: 5, cardTypes: ["unit"] }),
      ],
      ORDERS,
    );
    expect(stats.typeCounts).toEqual([{ cardType: "unit", count: 3 }]);
  });

  it("leaves legend, rune and battlefield out of the type breakdown", () => {
    const stats = summarizeDeckCards(
      [
        card({ cardTypes: ["legend"] }),
        card({ cardTypes: ["rune"] }),
        card({ cardTypes: ["battlefield"] }),
        card({ cardTypes: ["spell"] }),
      ],
      ORDERS,
    );
    expect(stats.typeCounts).toEqual([{ cardType: "spell", count: 1 }]);
  });

  it("counts a multi-type card under each of its non-excluded types", () => {
    const stats = summarizeDeckCards([card({ quantity: 2, cardTypes: ["unit", "gear"] })], ORDERS);
    expect(stats.typeCounts).toEqual([
      { cardType: "unit", count: 2 },
      { cardType: "gear", count: 2 },
    ]);
  });

  it("counts a dual-domain card under both domains", () => {
    const stats = summarizeDeckCards([card({ quantity: 3, domains: ["fury", "mind"] })], ORDERS);
    expect(stats.domainDistribution).toEqual([
      { domain: "fury", count: 3 },
      { domain: "mind", count: 3 },
    ]);
  });

  it("emits counts in enum display order, not encounter order", () => {
    const stats = summarizeDeckCards(
      [card({ cardTypes: ["spell"] }), card({ cardTypes: ["unit"] })],
      ORDERS,
    );
    expect(stats.typeCounts.map((entry) => entry.cardType)).toEqual(["unit", "spell"]);
  });

  it("omits types and domains that no counted card carries", () => {
    const stats = summarizeDeckCards([card()], ORDERS);
    expect(stats.typeCounts).toEqual([{ cardType: "unit", count: 1 }]);
    expect(stats.domainDistribution).toEqual([{ domain: "fury", count: 1 }]);
  });

  it("returns zeroed stats for an empty deck", () => {
    expect(summarizeDeckCards([], ORDERS)).toEqual({
      legendCardId: null,
      championCardId: null,
      totalCards: 0,
      typeCounts: [],
      domainDistribution: [],
    });
  });
});

function ruleCard(overrides: Partial<DeckCard> = {}): DeckCard {
  return {
    cardId: "card-1",
    zone: WellKnown.deckZone.MAIN,
    quantity: 1,
    cardName: "Test Card",
    cardType: "unit",
    cardTypes: ["unit"],
    superTypes: [],
    domains: ["fury"],
    tags: [],
    customTagSlugs: [],
    keywords: [],
    maxCopiesOverride: null,
    banned: false,
    ...overrides,
  } as DeckCard;
}

describe("isValidInDeckList", () => {
  it("reports any non-constructed format as valid without validating", () => {
    expect(isValidInDeckList(WellKnown.deckFormat.FREEFORM, [ruleCard({ banned: true })])).toBe(
      true,
    );
  });

  it("reports a constructed deck with violations as invalid", () => {
    expect(isValidInDeckList(WellKnown.deckFormat.CONSTRUCTED, [ruleCard({ banned: true })])).toBe(
      false,
    );
  });

  it("reports an empty constructed deck as invalid", () => {
    expect(isValidInDeckList(WellKnown.deckFormat.CONSTRUCTED, [])).toBe(false);
  });
});

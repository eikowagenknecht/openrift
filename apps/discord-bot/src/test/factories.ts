import type { CatalogResponse, CatalogSetResponse, PricesResponse } from "@openrift/shared";

import type { CatalogCard, CatalogPrinting } from "../catalog-cache.js";

/** @returns A catalog card with sensible defaults, overridable per test. */
export function makeCard(overrides: Partial<CatalogCard> = {}): CatalogCard {
  return {
    id: "card-1",
    slug: "jinx-rebel",
    name: "Jinx, Rebel",
    type: "Unit",
    types: ["Unit"],
    superTypes: ["Champion"],
    domains: ["Chaos"],
    might: 5,
    energy: 5,
    power: null,
    keywords: [],
    tags: [],
    mightBonus: null,
    maxCopiesOverride: null,
    errata: null,
    bans: [],
    ...overrides,
  };
}

/** @returns A catalog printing with sensible defaults, overridable per test. */
export function makePrinting(overrides: Partial<CatalogPrinting> = {}): CatalogPrinting {
  return {
    id: "printing-1",
    shortCode: "OGN-202",
    setId: "set-1",
    rarity: "Epic",
    artVariant: "normal",
    isSigned: false,
    markers: [],
    distributionChannels: [],
    finish: "normal",
    size: "standard",
    images: [{ face: "front", imageId: "0197f00d00aa" }],
    artist: "Kudos Productions",
    publicCode: "OGN-202/298",
    printedRulesText: null,
    printedEffectText: null,
    flavorText: null,
    printedName: null,
    printedYear: 2025,
    language: "EN",
    comment: null,
    canonicalRank: 1,
    cardId: "card-1",
    ...overrides,
  };
}

/** @returns A catalog set with sensible defaults, overridable per test. */
export function makeSet(overrides: Partial<CatalogSetResponse> = {}): CatalogSetResponse {
  return {
    id: "set-1",
    slug: "OGN",
    name: "Origins",
    releasedAt: "2025-10-31",
    released: true,
    setType: "main",
    ...overrides,
  };
}

/** @returns A CatalogResponse wire payload assembled from full card/printing objects. */
export function makeCatalogResponse(
  cards: CatalogCard[],
  printings: CatalogPrinting[],
  sets: CatalogSetResponse[] = [makeSet()],
): CatalogResponse {
  return {
    sets,
    cards: Object.fromEntries(cards.map(({ id, ...card }) => [id, card])),
    printings: Object.fromEntries(printings.map(({ id, ...printing }) => [id, printing])),
    totalCopies: printings.length,
    customTagAssignments: {},
  };
}

/** @returns A PricesResponse with the given per-printing cents maps. */
export function makePricesResponse(prices: PricesResponse["prices"] = {}): PricesResponse {
  return {
    prices,
    currencies: { tcgplayer: "USD", cardmarket: "EUR", cardtrader: "EUR" },
  };
}

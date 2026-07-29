import type {
  CatalogResponse,
  CatalogSetResponse,
  InitResponse,
  PricesResponse,
} from "@openrift/shared";

import type { CatalogCard, CatalogPrinting } from "../catalog-cache.js";

/** @returns A catalog card with sensible defaults, overridable per test. */
export function makeCard(overrides: Partial<CatalogCard> = {}): CatalogCard {
  return {
    id: "card-1",
    slug: "jinx-rebel",
    name: "Jinx, Rebel",
    type: "unit",
    types: ["unit"],
    superTypes: ["champion"],
    domains: ["chaos"],
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

/** @returns An InitResponse whose enum rows cover the slugs the card factory uses. */
export function makeInitResponse(): InitResponse {
  return {
    enums: {
      cardTypes: [
        { slug: "unit", label: "Unit", sortOrder: 1 },
        { slug: "spell", label: "Spell", sortOrder: 2 },
      ],
      rarities: [],
      domains: [
        { slug: "chaos", label: "Chaos", sortOrder: 1, color: "#b8336a" },
        { slug: "fury", label: "Fury", sortOrder: 2, color: "#c23c2a" },
      ],
      superTypes: [{ slug: "champion", label: "Champion", sortOrder: 1 }],
      finishes: [],
      artVariants: [],
      cardSizes: [],
      deckFormats: [],
      deckZones: [],
      conditions: [],
      graders: [],
      languages: [],
      markers: [],
    },
    keywords: {},
    distributionChannels: [],
    customTags: [],
    championIdentifierTags: [],
    tagCategories: [],
    tagCategoryMap: {},
  };
}

/** @returns A PricesResponse with the given per-printing cents maps. */
export function makePricesResponse(prices: PricesResponse["prices"] = {}): PricesResponse {
  return {
    prices,
    currencies: { tcgplayer: "USD", cardmarket: "EUR", cardtrader: "EUR" },
  };
}

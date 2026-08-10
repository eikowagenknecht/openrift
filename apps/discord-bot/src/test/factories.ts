import type {
  CatalogResponse,
  CatalogSetResponse,
  InitResponse,
  PricesResponse,
  RuleResponse,
} from "@openrift/shared";

import type { CatalogCard, CatalogPrinting } from "../catalog-cache.js";
import type { RulesSnapshot } from "../rules-cache.js";

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
    tokenCardIds: [],
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
        { slug: "legend", label: "Legend", sortOrder: 3 },
        { slug: "rune", label: "Rune", sortOrder: 4 },
        { slug: "battlefield", label: "Battlefield", sortOrder: 5 },
      ],
      rarities: [],
      domains: [
        { slug: "chaos", label: "Chaos", sortOrder: 1, color: "#b8336a" },
        { slug: "fury", label: "Fury", sortOrder: 2, color: "#c23c2a" },
      ],
      superTypes: [{ slug: "champion", label: "Champion", sortOrder: 1 }],
      finishes: [
        { slug: "normal", label: "Normal", sortOrder: 1 },
        { slug: "foil", label: "Foil", sortOrder: 2 },
        { slug: "metal", label: "Metal", sortOrder: 3 },
        { slug: "metal-deluxe", label: "Metal Deluxe", sortOrder: 4 },
      ],
      artVariants: [
        { slug: "normal", label: "Normal", sortOrder: 1 },
        { slug: "altart", label: "Alt Art", sortOrder: 2 },
      ],
      cardSizes: [
        { slug: "standard", label: "Standard", sortOrder: 1 },
        { slug: "oversized", label: "Oversized", sortOrder: 2 },
      ],
      deckFormats: [],
      deckZones: [
        { slug: "legend", label: "Legend", sortOrder: 1 },
        { slug: "champion", label: "Champion", sortOrder: 2 },
        { slug: "battlefield", label: "Battlefield", sortOrder: 3 },
        { slug: "runes", label: "Runes", sortOrder: 4 },
        { slug: "main", label: "Main Deck", sortOrder: 5 },
        { slug: "sideboard", label: "Sideboard", sortOrder: 6 },
      ],
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

/**
 * @returns A PricesResponse with the given per-printing cents maps, and no
 *          price marked stale. Pass `stale` when a test needs an aged price.
 */
export function makePricesResponse(
  prices: PricesResponse["prices"] = {},
  stale: PricesResponse["stale"] = {},
): PricesResponse {
  return {
    prices,
    currencies: { tcgplayer: "USD", cardmarket: "EUR", cardtrader: "EUR" },
    stale,
  };
}

/** @returns A rule row with sensible defaults, overridable per test. */
export function makeRule(overrides: Partial<RuleResponse> & { ruleNumber: string }): RuleResponse {
  return {
    id: overrides.ruleNumber,
    kind: "core",
    version: "2026-07-16",
    sortOrder: 0,
    depth: overrides.ruleNumber.split(".").length - 1,
    ruleType: "text",
    content: "Rule text.",
    changeType: "added",
    ...overrides,
  };
}

/**
 * Assembles a rules snapshot from plain rule rows; the tournament rows get
 * their kind stamped so tests only vary the fields they care about.
 *
 * @returns A rules snapshot with the given core and tournament rules.
 */
export function makeRulesSnapshot(
  core: RuleResponse[],
  tournament: RuleResponse[] = [],
): RulesSnapshot {
  return {
    core: { kind: "core", version: "2026-07-16", rules: core },
    tournament: {
      kind: "tournament",
      version: "2026-05-01",
      rules: tournament.map((rule) => ({ ...rule, kind: "tournament" as const })),
    },
  };
}

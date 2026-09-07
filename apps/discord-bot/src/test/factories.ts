import type {
  CatalogResponse,
  CatalogSetResponse,
  InitResponse,
  PricesResponse,
  RuleResponse,
} from "@openrift/shared";
import { makeCatalogCard, makeCatalogPrinting } from "@openrift/shared/test-factories";

import type { CatalogCard, CatalogPrinting } from "../catalog-cache.js";
import type { RulesSnapshot } from "../rules-cache.js";

export function makeCard(overrides: Partial<CatalogCard> = {}): CatalogCard {
  return makeCatalogCard({
    slug: "jinx-rebel",
    name: "Jinx, Rebel",
    superTypes: ["champion"],
    domains: ["chaos"],
    might: 5,
    energy: 5,
    ...overrides,
  });
}

export function makePrinting(overrides: Partial<CatalogPrinting> = {}): CatalogPrinting {
  return makeCatalogPrinting({
    shortCode: "OGN-202",
    rarity: "Epic",
    images: [{ face: "front", imageId: "0197f00d00aa" }],
    artist: "Kudos Productions",
    publicCode: "OGN-202/298",
    printedYear: 2025,
    canonicalRank: 1,
    ...overrides,
  });
}

export function makeSet(overrides: Partial<CatalogSetResponse> = {}): CatalogSetResponse {
  return {
    id: "set-1",
    slug: "OGN",
    name: "Origins",
    releases: { EN: { releasedAt: "2025-10-31", precision: "day" } },
    setType: "main",
    ...overrides,
  };
}

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

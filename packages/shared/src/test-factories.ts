/**
 * Plain module, no vitest import: importing vitest here would drag it into
 * app bundles.
 */

import type {
  Card,
  CatalogResponseCardValue,
  CatalogResponsePrintingValue,
  Printing,
} from "./types/index.js";

/** The wire card as `/catalog` sends it, carrying its own id. */
export type CatalogCardFixture = CatalogResponseCardValue & { id: string };

/** The wire printing as `/catalog` sends it, carrying its own id. */
export type CatalogPrintingFixture = CatalogResponsePrintingValue & { id: string };

// Drops undefined-valued keys, so a caller forwarding its own optional
// override doesn't clobber the default with an explicit undefined.
function defined<T extends object>(overrides: T): T {
  return Object.fromEntries(
    Object.entries(overrides).filter(([, value]) => value !== undefined),
  ) as T;
}

/** A card with neutral defaults. Override only the fields under test. */
export function makeCard(partial: Partial<Card> = {}): Card {
  const overrides = defined(partial);
  // `type` and `types` must agree, so overriding either fixes both.
  const type = overrides.type ?? overrides.types?.[0] ?? "unit";
  return {
    slug: "test-card",
    name: "Test Card",
    type,
    types: [type],
    superTypes: [],
    domains: [],
    tokenCardIds: [],
    might: null,
    energy: null,
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

/** {@link makeCard} as the wire sends it: the same fields plus the card's id. */
export function makeCatalogCard(partial: Partial<CatalogCardFixture> = {}): CatalogCardFixture {
  const { id = "card-1", ...card } = defined(partial);
  return { id, ...makeCard(card) };
}

/** The wire printing, unjoined. Neutral defaults; override what you assert on. */
export function makeCatalogPrinting(
  partial: Partial<CatalogPrintingFixture> = {},
): CatalogPrintingFixture {
  return {
    id: "printing-1",
    cardId: "card-1",
    shortCode: "SET-001",
    setId: "set-1",
    rarity: "common",
    artVariant: "normal",
    isSigned: false,
    isOvernumbered: false,
    markers: [],
    distributionChannels: [],
    finish: "normal",
    size: "standard",
    images: [],
    artist: "Artist",
    publicCode: "001",
    printedRulesText: null,
    printedEffectText: null,
    flavorText: null,
    printedName: null,
    printedYear: null,
    comment: null,
    language: "EN",
    canonicalRank: 0,
    ...defined(partial),
  };
}

/**
 * A printing joined to its set columns and its card — the shape app code works
 * with. Pass a partial `card` to override the join without spelling out the
 * whole card.
 */
export function makePrinting(
  partial: Omit<Partial<Printing>, "card"> & { card?: Partial<Card> } = {},
): Printing {
  const { card, setSlug, setReleased, ...printing } = defined(partial);
  return {
    ...makeCatalogPrinting(printing),
    setSlug: setSlug ?? "set-alpha",
    setReleased: setReleased ?? true,
    card: makeCard(card),
  };
}

/**
 * Fixture builders for the catalogue types every package's tests work with.
 *
 * They live here rather than in one app's test folder because `Card` and
 * `Printing` are shared types: a field added to either used to mean editing
 * every test file that spelled the literal out by hand. A test overrides only
 * what it asserts on and inherits the rest.
 *
 * Two levels, matching the two shapes the catalogue actually has: the wire
 * printing (`makeCatalogPrinting`, what `/catalog` sends) and the joined one
 * (`makePrinting`, which adds the set columns and the card). The joined
 * builder is the wire one plus exactly those three fields, so a new wire field
 * reaches both from one place.
 *
 * Test-only, but a plain module: importing vitest here would drag it into app
 * bundles.
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

/**
 * Drops keys whose value is `undefined`, so a caller forwarding its own
 * optional override (`{ type, keywords }` where either may be absent) gets the
 * default rather than an undefined field the type says cannot be undefined.
 *
 * @returns The overrides with every explicitly-undefined key removed.
 */
function defined<T extends object>(overrides: T): T {
  return Object.fromEntries(
    Object.entries(overrides).filter(([, value]) => value !== undefined),
  ) as T;
}

/** A card with neutral defaults. Override only the fields under test. */
export function makeCard(partial: Partial<Card> = {}): Card {
  const overrides = defined(partial);
  // `type` and `types` must agree (ADR-037), so overriding either fixes both.
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

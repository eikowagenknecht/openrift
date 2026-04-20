/**
 * Shared test factories for creating stub data objects.
 * Uses deep defaults with partial overrides for convenience.
 */
import type {
  Card,
  CardType,
  DeckZone,
  Domain,
  Marketplace,
  PriceLookup,
  PriceMap,
  Printing,
  SuperType,
} from "@openrift/shared";
import { priceLookupFromMap } from "@openrift/shared";

import type { CardViewerItem } from "@/components/card-viewer-types";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";

let idCounter = 0;

function nextId(): string {
  idCounter++;
  return `00000000-0000-0000-0000-${String(idCounter).padStart(12, "0")}`;
}

/**
 * Resets the ID counter between tests to keep IDs deterministic.
 */
export function resetIdCounter(): void {
  idCounter = 0;
}

/**
 * Creates a stub Card object with sensible defaults.
 * @returns A complete Card object with overrides applied.
 */
export function stubCard(overrides: Partial<Card> = {}): Card {
  const slug = overrides.slug ?? `RB1-${nextId().slice(-3)}`;
  return {
    slug,
    name: "Test Card",
    type: "Unit",
    superTypes: [],
    domains: [],
    might: 1,
    energy: 1,
    power: 1,
    keywords: [],
    tags: [],
    mightBonus: 0,
    errata: null,
    bans: [],
    ...overrides,
  };
}

/**
 * Creates a stub Printing object with sensible defaults.
 * @returns A complete Printing object with overrides applied.
 */
export function stubPrinting(
  overrides: Omit<Partial<Printing>, "card"> & { card?: Partial<Card> } = {},
): Printing {
  const id = overrides.id ?? nextId();
  const cardId = overrides.cardId ?? nextId();
  const { card: cardOverrides, ...printingOverrides } = overrides;
  const card = stubCard(cardOverrides);
  return {
    id,
    cardId,
    shortCode: card.slug,
    setId: nextId(),
    setSlug: "RB1",
    rarity: "Common",
    artVariant: "normal",
    isSigned: false,
    markers: [],
    distributionChannels: [],
    finish: "normal",
    images: [],
    artist: "Test Artist",
    publicCode: card.slug.toLowerCase(),
    printedRulesText: null,
    printedEffectText: null,
    flavorText: null,
    printedName: null,
    comment: null,
    language: "EN",
    canonicalRank: 0,
    card,
    ...printingOverrides,
  };
}

/**
 * Creates a stub CardViewerItem from a Printing.
 * @returns A CardViewerItem wrapping the printing.
 */
export function stubCardViewerItem(
  overrides: Omit<Partial<Printing>, "card"> & { card?: Partial<Card> } = {},
): CardViewerItem {
  const printing = stubPrinting(overrides);
  return { id: printing.id, printing };
}

/**
 * Builds a {@link PriceLookup} from a map of `printingId → marketplace → price`.
 * Use in place of attaching prices to test printings — keeps the printing factory
 * decoupled from pricing data.
 * @returns A lookup that resolves prices from the given map.
 */
export function stubPriceLookup(
  prices: Record<string, Partial<Record<Marketplace, number>>>,
): PriceLookup {
  return priceLookupFromMap(prices as PriceMap);
}

/**
 * Creates a DeckBuilderCard stub for deck builder store tests.
 * @returns A DeckBuilderCard with overrides applied.
 */
export function stubDeckBuilderCard(overrides: Partial<DeckBuilderCard> = {}): DeckBuilderCard {
  return {
    cardId: overrides.cardId ?? nextId(),
    zone: "main" as DeckZone,
    quantity: 1,
    preferredPrintingId: null,
    cardName: "Test Card",
    cardType: "Unit" as CardType,
    superTypes: [] as SuperType[],
    domains: [] as Domain[],
    tags: [],
    keywords: [],
    energy: 1,
    might: 1,
    power: 1,
    ...overrides,
  };
}

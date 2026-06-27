/**
 * Shared test factories for creating stub data objects.
 * Uses deep defaults with partial overrides for convenience.
 */
import type {
  Card,
  CardType,
  CopyResponse,
  DeckZone,
  Domain,
  Marketplace,
  PriceLookup,
  Printing,
  SuperType,
  TradePreference,
} from "@openrift/shared";

import type { CardViewerItem } from "@/components/card-viewer-types";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import type { DeckCardShapeRow } from "@/lib/decks-offline";

/** Empty trade preference (ADR-017). Useful for list/entry fixtures that don't exercise prefs. */
export const EMPTY_TRADE_PREFERENCE: TradePreference = {
  pricePref: null,
  priceAbsoluteCents: null,
  tradeType: null,
};

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
 * Creates a stub CopyResponse with empty metadata (ADR-038) defaults.
 * @returns A complete CopyResponse with overrides applied.
 */
export function stubCopy(overrides: Partial<CopyResponse> = {}): CopyResponse {
  return {
    id: nextId(),
    printingId: nextId(),
    collectionId: nextId(),
    groupId: null,
    condition: null,
    grader: null,
    grade: null,
    notesPublic: null,
    notesPrivate: null,
    isAltered: false,
    links: [],
    ...overrides,
  };
}

/**
 * Creates a stub Card object with sensible defaults.
 * @returns A complete Card object with overrides applied.
 */
export function stubCard(overrides: Partial<Card> = {}): Card {
  const slug = overrides.slug ?? `RB1-${nextId().slice(-3)}`;
  // Keep `type` and `types` consistent when only one is overridden (ADR-037).
  const type = overrides.type ?? overrides.types?.[0] ?? "unit";
  return {
    slug,
    name: "Test Card",
    type,
    types: [type],
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
    setReleased: true,
    rarity: "common",
    artVariant: "normal",
    isSigned: false,
    markers: [],
    distributionChannels: [],
    finish: "normal",
    size: "standard",
    images: [],
    artist: "Test Artist",
    publicCode: card.slug.toLowerCase(),
    printedRulesText: null,
    printedEffectText: null,
    flavorText: null,
    printedName: null,
    printedYear: null,
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
 * Builds a {@link PriceLookup} from a map of `printingId → marketplace → price`,
 * where prices are already in **major units** (the unit app code works in after
 * the display boundary). Unlike `priceLookupFromMap` — which converts wire cents
 * down to major units — this returns values verbatim, so tests can keep
 * expressing prices as e.g. `{ tcgplayer: 5.5 }`.
 * @returns A lookup that resolves the given major-unit prices directly.
 */
export function stubPriceLookup(
  prices: Record<string, Partial<Record<Marketplace, number>>>,
): PriceLookup {
  return {
    get: (printingId, marketplace) => prices[printingId]?.[marketplace],
    has: (printingId) => prices[printingId] !== undefined,
  };
}

/**
 * Creates a DeckBuilderCard stub for deck builder store tests.
 * @returns A DeckBuilderCard with overrides applied.
 */
/**
 * Creates a stub synced deck-card shape row (ADR-027 decks vertical).
 * @returns A complete DeckCardShapeRow with overrides applied.
 */
export function stubDeckCardShapeRow(overrides: Partial<DeckCardShapeRow> = {}): DeckCardShapeRow {
  return {
    id: overrides.id ?? nextId(),
    deck_id: "deck-1",
    card_id: overrides.card_id ?? nextId(),
    zone: "main" as DeckZone,
    quantity: 1,
    preferred_printing_id: null,
    ...overrides,
  };
}

export function stubDeckBuilderCard(overrides: Partial<DeckBuilderCard> = {}): DeckBuilderCard {
  const cardType = overrides.cardType ?? overrides.cardTypes?.[0] ?? ("unit" as CardType);
  return {
    cardId: overrides.cardId ?? nextId(),
    zone: "main" as DeckZone,
    quantity: 1,
    preferredPrintingId: null,
    cardName: "Test Card",
    cardType,
    cardTypes: [cardType],
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

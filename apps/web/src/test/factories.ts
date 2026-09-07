import { makeCard, makePrinting } from "@openrift/shared/test-factories";
import type { CopyResponse } from "@openrift/shared/types/api/collection";
import type { MetaPlayerDetailResponse, MetaPlayerFinish } from "@openrift/shared/types/api/meta";
import type { PriceLookup } from "@openrift/shared/types/api/pricing";
import type { TradePreference } from "@openrift/shared/types/api/trade-preferences";
import type { Card, Printing } from "@openrift/shared/types/catalog";
import type { CardType, DeckZone, Domain, SuperType } from "@openrift/shared/types/enums";
import type { Marketplace } from "@openrift/shared/types/pricing";

import type { DeckBuilderCard } from "@/features/decks/lib/deck-builder-card";
import type { CardOwnership } from "@/features/decks/lib/deck-ownership-types";
import type { CardViewerItem } from "@/lib/card-viewer-types";

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

export function resetIdCounter(): void {
  idCounter = 0;
}

export function stubCopy(overrides: Partial<CopyResponse> = {}): CopyResponse {
  return {
    id: nextId(),
    printingId: nextId(),
    collectionId: nextId(),
    groupId: null,
    onLoan: false,
    reserved: false,
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

/** Adds the web fixtures' generated slug and stat line on top of the shared defaults. */
export function stubCard(overrides: Partial<Card> = {}): Card {
  return makeCard({
    slug: `RB1-${nextId().slice(-3)}`,
    might: 1,
    energy: 1,
    power: 1,
    mightBonus: 0,
    ...overrides,
  });
}

export function stubPrinting(
  overrides: Omit<Partial<Printing>, "card"> & { card?: Partial<Card> } = {},
): Printing {
  // Drawn before the card so a fixture's generated ids stay stable
  // regardless of what the shared defaults do.
  const id = overrides.id ?? nextId();
  const cardId = overrides.cardId ?? nextId();
  const { card: cardOverrides, ...printingOverrides } = overrides;
  const card = stubCard(cardOverrides);
  return makePrinting({
    id,
    cardId,
    shortCode: card.slug,
    setId: nextId(),
    setSlug: "RB1",
    artist: "Test Artist",
    publicCode: card.slug.toLowerCase(),
    ...printingOverrides,
    card,
  });
}

export function stubCardViewerItem(
  overrides: Omit<Partial<Printing>, "card"> & { card?: Partial<Card> } = {},
): CardViewerItem {
  const printing = stubPrinting(overrides);
  return { id: printing.id, printing };
}

/**
 * Prices are major units verbatim, unlike `priceLookupFromMap` which converts
 * wire cents.
 */
export function stubPriceLookup(
  prices: Record<string, Partial<Record<Marketplace, number>>>,
): PriceLookup {
  return {
    get: (printingId, marketplace) => prices[printingId]?.[marketplace],
    has: (printingId) => prices[printingId] !== undefined,
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
    maxCopiesOverride: null,
    banned: false,
    energy: 1,
    might: 1,
    power: 1,
    ...overrides,
  };
}

export function stubCardOwnership(overrides: Partial<CardOwnership> = {}): CardOwnership {
  const name = overrides.cardName ?? "Test Card";
  return {
    cardId: nextId(),
    cardName: name,
    cardSlug: "test-card",
    displayName: name,
    zone: "main",
    needed: 1,
    owned: 0,
    shortfall: 1,
    locked: 0,
    lockedLoaned: 0,
    lockedReserved: 0,
    lockedExcluded: 0,
    borrowed: 0,
    incoming: 0,
    displayPrice: undefined,
    cheapestPrice: undefined,
    cheapestPrinting: undefined,
    displayPrinting: {
      id: nextId(),
      language: "EN",
      shortCode: "OGN-001",
      setId: "set-origins",
      rarity: "common",
      imageId: undefined,
      landscape: false,
    },
    ...overrides,
  };
}

const META_PLAYER_LEGEND: NonNullable<MetaPlayerFinish["legend"]> = {
  cardId: "legend-lux",
  name: "Lux, Lady of Luminosity",
  slug: "lady-of-luminosity",
  imageId: "img-lux",
  domains: ["calm"],
  archiveSlug: "lux-lady-of-luminosity",
};

type MetaPlayerFinishOverrides = Partial<Omit<MetaPlayerFinish, "event">> & {
  event?: Partial<MetaPlayerFinish["event"]>;
};

/** Pass `legend: null` for a row no source named a legend for. */
export function makeMetaPlayerFinish(overrides: MetaPlayerFinishOverrides = {}): MetaPlayerFinish {
  const { event, ...rest } = overrides;
  return {
    playerId: nextId(),
    rank: 1,
    rankIsTier: false,
    wins: 6,
    losses: 1,
    draws: 0,
    shareToken: null,
    listStatus: "none",
    legend: { ...META_PLAYER_LEGEND },
    ...rest,
    event: {
      slug: "summoner-skirmish",
      name: "Summoner Skirmish",
      eventDate: "2026-08-01",
      format: "constructed",
      tier: "local",
      country: "DE",
      playerCount: 64,
      ...event,
    },
  };
}

export function makeMetaPlayerDetail(
  overrides: Partial<MetaPlayerDetailResponse> = {},
): MetaPlayerDetailResponse {
  return {
    key: "pnrenata",
    name: "Renata",
    finishes: [makeMetaPlayerFinish()],
    ...overrides,
  };
}

import { copyLimitFor } from "@openrift/shared/deck-rules";
import type { PriceLookup } from "@openrift/shared/types/api/pricing";
import type { DeckFormat, DeckZone } from "@openrift/shared/types/enums";
import type { Marketplace } from "@openrift/shared/types/pricing";
import { WellKnown } from "@openrift/shared/well-known";

import type { HoverHandler } from "@/lib/card-row-interactions";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { canAddRune, COPY_LIMIT_ZONES, getDeckCardKey, RUNE_TARGET } from "@/lib/deck-builder-card";
import type { OwnershipBandSegments } from "@/lib/deck-ownership-band";
import type { DeckOwnershipData } from "@/lib/deck-ownership-types";
import { formatterForMarketplace } from "@/lib/format";

export const STEPPER_ZONES: ReadonlySet<DeckZone> = new Set([
  WellKnown.deckZone.RUNES,
  WellKnown.deckZone.MAIN,
  WellKnown.deckZone.SIDEBOARD,
  WellKnown.deckZone.OVERFLOW,
]);

export const NO_BANDS: ReadonlyMap<string, OwnershipBandSegments> = new Map();

export const NO_PRICE_TEXTS: ReadonlyMap<string, string> = new Map();

export const NO_CARDS: DeckBuilderCard[] = [];

export const NO_ADD_ROOM: ReadonlyMap<string, number> = new Map();

// Must mirror the checks `addCardAction` makes.
export function buildAddRoom(cards: DeckBuilderCard[], format: DeckFormat): Map<string, number> {
  const room = new Map<string, number>();
  const freeform = format === WellKnown.deckFormat.FREEFORM;
  const runeTotal = cards.reduce(
    (sum, card) => (card.zone === WellKnown.deckZone.RUNES ? sum + card.quantity : sum),
    0,
  );
  for (const card of cards) {
    const key = getDeckCardKey(card);
    if (freeform || !STEPPER_ZONES.has(card.zone)) {
      room.set(key, Number.POSITIVE_INFINITY);
      continue;
    }
    if (card.zone === WellKnown.deckZone.RUNES) {
      // canAddRune still allows a one-copy swap at the rune target on a two-domain legend.
      room.set(key, canAddRune(card, cards) ? Math.max(1, RUNE_TARGET - runeTotal) : 0);
      continue;
    }
    if (COPY_LIMIT_ZONES.has(card.zone)) {
      const held = cards.reduce(
        (sum, entry) =>
          entry.cardId === card.cardId && COPY_LIMIT_ZONES.has(entry.zone)
            ? sum + entry.quantity
            : sum,
        0,
      );
      room.set(key, Math.max(0, copyLimitFor(card) - held));
      continue;
    }
    room.set(key, Number.POSITIVE_INFINITY);
  }
  return room;
}

// Must mirror the price resolution the list rows use.
export function buildPriceTexts(
  cards: DeckBuilderCard[],
  ownershipData: DeckOwnershipData,
  preferOwned: boolean,
  priceMap: PriceLookup | undefined,
  marketplace: Marketplace,
): Map<string, string> {
  const fmtPrice = formatterForMarketplace(marketplace);
  const texts = new Map<string, string>();
  for (const card of cards) {
    const owned = preferOwned ? ownershipData.ownedPrintingByCardId.get(card.cardId) : undefined;
    const entry = ownershipData.byCardZone.get(`${card.cardId}:${card.zone}`);
    const cents =
      owned && priceMap
        ? priceMap.get(owned.id, marketplace)
        : (entry?.cheapestPrice ?? entry?.displayPrice);
    if (cents !== undefined) {
      texts.set(getDeckCardKey(card), fmtPrice(cents));
    }
  }
  return texts;
}

export function expandCopies(
  cards: DeckBuilderCard[],
  showAllCopies: boolean,
): { card: DeckBuilderCard; copyIndex: number | null }[] {
  if (!showAllCopies) {
    return cards.map((card) => ({ card, copyIndex: null }));
  }
  return cards.flatMap((card): { card: DeckBuilderCard; copyIndex: number | null }[] =>
    card.quantity > 1
      ? Array.from({ length: card.quantity }, (_, copyIndex) => ({ card, copyIndex }))
      : [{ card, copyIndex: null }],
  );
}

export function zoneShowsAllCopies(
  zone: DeckZone,
  showAllCopies: boolean,
  showAllRuneCopies: boolean,
): boolean {
  return zone === WellKnown.deckZone.RUNES ? showAllCopies && showAllRuneCopies : showAllCopies;
}

// Stacks mode expands cards in place; suppress the docked hover preview there.
export function overviewHoverHandler(
  stacked: boolean,
  onHoverCard?: HoverHandler,
): HoverHandler | undefined {
  return stacked ? undefined : onHoverCard;
}

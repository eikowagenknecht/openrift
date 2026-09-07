import type { DeckCardResponse } from "@openrift/shared/types/api/deck";
import type { Card } from "@openrift/shared/types/catalog";
import type { DeckZone } from "@openrift/shared/types/enums";
import { legendDisplayName } from "@openrift/shared/utils";
import { WellKnown } from "@openrift/shared/well-known";

export interface DeckDiffCard {
  cardId: string;
  cardName: string;
  zone: DeckZone;
  quantity: number;
}

export interface DeckDiffEntry {
  cardId: string;
  cardName: string;
  kind: "add" | "cut" | "change";
  ours: number;
  theirs: number;
}

interface DeckDiffZone {
  zone: DeckZone;
  entries: DeckDiffEntry[];
}

export interface DeckDiff {
  zones: DeckDiffZone[];
  sharedCount: number;
  addCount: number;
  cutCount: number;
}

export const ZONE_DIFF_ORDER: readonly DeckZone[] = [
  WellKnown.deckZone.LEGEND,
  WellKnown.deckZone.CHAMPION,
  WellKnown.deckZone.RUNES,
  WellKnown.deckZone.BATTLEFIELD,
  WellKnown.deckZone.MAIN,
  WellKnown.deckZone.SIDEBOARD,
  WellKnown.deckZone.OVERFLOW,
];

// Adds read as the shopping list, so they lead; cuts are what's left over.
const KIND_SORT_ORDER: Record<DeckDiffEntry["kind"], number> = {
  add: 0,
  change: 1,
  cut: 2,
};

export function deckDiffCardsFrom(
  cards: readonly DeckCardResponse[],
  cardsById: Record<string, Card>,
): DeckDiffCard[] {
  const result: DeckDiffCard[] = [];
  for (const card of cards) {
    const catalogCard = cardsById[card.cardId];
    if (!catalogCard) {
      continue;
    }
    result.push({
      cardId: card.cardId,
      cardName: legendDisplayName(catalogCard),
      zone: card.zone,
      quantity: card.quantity,
    });
  }
  return result;
}

interface Aggregated {
  cardId: string;
  cardName: string;
  zone: DeckZone;
  quantity: number;
}

function slotKey(cardId: string, zone: DeckZone): string {
  return `${cardId}|${zone}`;
}

function aggregate(cards: readonly DeckDiffCard[]): Map<string, Aggregated> {
  const slots = new Map<string, Aggregated>();
  for (const card of cards) {
    const key = slotKey(card.cardId, card.zone);
    const existing = slots.get(key);
    if (existing) {
      existing.quantity += card.quantity;
      continue;
    }
    slots.set(key, {
      cardId: card.cardId,
      cardName: card.cardName,
      zone: card.zone,
      quantity: card.quantity,
    });
  }
  return slots;
}

/** A card that moved zones is a cut plus an add, not a change. */
export function diffDecks(
  ours: readonly DeckDiffCard[],
  theirs: readonly DeckDiffCard[],
): DeckDiff {
  const ourSlots = aggregate(ours);
  const theirSlots = aggregate(theirs);

  const byZone = new Map<DeckZone, DeckDiffEntry[]>();
  let sharedCount = 0;
  let addCount = 0;
  let cutCount = 0;

  for (const key of new Set([...ourSlots.keys(), ...theirSlots.keys()])) {
    const ourSlot = ourSlots.get(key);
    const theirSlot = theirSlots.get(key);
    const slot = ourSlot ?? theirSlot;
    if (!slot) {
      continue;
    }
    const ourQuantity = ourSlot?.quantity ?? 0;
    const theirQuantity = theirSlot?.quantity ?? 0;

    sharedCount += Math.min(ourQuantity, theirQuantity);
    addCount += Math.max(0, theirQuantity - ourQuantity);
    cutCount += Math.max(0, ourQuantity - theirQuantity);

    if (ourQuantity === theirQuantity) {
      continue;
    }
    let kind: DeckDiffEntry["kind"] = "change";
    if (ourQuantity === 0) {
      kind = "add";
    } else if (theirQuantity === 0) {
      kind = "cut";
    }
    const entries = byZone.get(slot.zone) ?? [];
    entries.push({
      cardId: slot.cardId,
      cardName: ourSlot?.cardName ?? slot.cardName,
      kind,
      ours: ourQuantity,
      theirs: theirQuantity,
    });
    byZone.set(slot.zone, entries);
  }

  const zones: DeckDiffZone[] = [];
  for (const zone of ZONE_DIFF_ORDER) {
    const entries = byZone.get(zone);
    if (!entries || entries.length === 0) {
      continue;
    }
    zones.push({
      zone,
      entries: entries.toSorted((entryA, entryB) => {
        const kindDiff = KIND_SORT_ORDER[entryA.kind] - KIND_SORT_ORDER[entryB.kind];
        if (kindDiff !== 0) {
          return kindDiff;
        }
        return entryA.cardName.localeCompare(entryB.cardName);
      }),
    });
  }

  return { zones, sharedCount, addCount, cutCount };
}

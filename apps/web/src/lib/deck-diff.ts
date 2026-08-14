import type { Card, DeckCardResponse, DeckZone } from "@openrift/shared";
import { WellKnown } from "@openrift/shared";

/** One side's card list, reduced to the fields the diff cares about. */
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
  /** Copies in the open deck. 0 for "add". */
  ours: number;
  /** Copies in the compared list. 0 for "cut". */
  theirs: number;
}

interface DeckDiffZone {
  zone: DeckZone;
  entries: DeckDiffEntry[];
}

export interface DeckDiff {
  /** Zones in display order; a zone with no differing entries is omitted. */
  zones: DeckDiffZone[];
  /** Copies present on both sides, summed over (card, zone). */
  sharedCount: number;
  /** Total copies to add to reach the compared list. */
  addCount: number;
  /** Total copies to cut to reach the compared list. */
  cutCount: number;
}

// Display order for the diff's zone sections, mirroring the deck sidebar.
const ZONE_DIFF_ORDER: readonly DeckZone[] = [
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

/**
 * Reshapes a stored deck's cards for the diff, naming each one from the
 * catalog. A card id the catalog doesn't know is dropped rather than shown
 * nameless — it can only be a printing the current language filter hides or a
 * row left over from a card that left the catalog.
 *
 * @returns The deck's cards in diff shape.
 */
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
      cardName: catalogCard.name,
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

/**
 * Sums a side's copies per (card, zone). The builder can hold one card as
 * several rows when printings are pinned, so the raw lists are not keyed the
 * way the diff needs.
 * @returns A map of "cardId|zone" to the summed slot.
 */
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

/**
 * Compares the open deck against a pasted list, in the direction "what turns
 * my deck into that one": an `add` is only in theirs, a `cut` is only in ours,
 * and a `change` is in both at different counts. Copies of the same card in
 * different zones are separate slots, so a card that moved from main to
 * sideboard shows as a cut plus an add rather than a change.
 *
 * @returns The per-zone entries plus the shared / add / cut copy totals.
 */
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
      // Both sides carry a name; ours wins so the diff reads in the catalog
      // language the builder is already showing.
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

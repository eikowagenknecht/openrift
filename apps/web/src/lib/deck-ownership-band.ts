import { WellKnown } from "@openrift/shared";

import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { getDeckCardKey } from "@/lib/deck-builder-card";

/**
 * How one deck entry's copies split by collection status, in copies. The four
 * numbers always add up to the entry's quantity, and the band draws them as
 * proportional segments: green, then blue, then amber, then nothing for the
 * remainder. Locked copies (on loan, reserved, excluded collection) still
 * count as missing in every shortfall figure — the band just reveals which
 * missing copies the viewer technically holds.
 */
export interface OwnershipBandSegments {
  /** Copies covered by the printing shown on the thumbnail. */
  exact: number;
  /** Copies covered by other printings of the same card. */
  other: number;
  /** Copies the viewer holds but locked away from deck building. */
  locked: number;
  /** Copies the viewer doesn't have at all. */
  missing: number;
}

/**
 * Splits one entry's quantity across the copies on hand: the printing on
 * screen fills the band first, other printings of the same card fill what's
 * left, locked copies cover the shortfall next, and the rest is missing.
 *
 * @returns The entry's segments, in copies.
 */
export function ownershipBandSegments(
  quantity: number,
  ownedOfDisplayed: number,
  ownedOfOthers: number,
  lockedOfCard = 0,
): OwnershipBandSegments {
  const needed = Math.max(0, quantity);
  const exact = Math.min(needed, Math.max(0, ownedOfDisplayed));
  const other = Math.min(needed - exact, Math.max(0, ownedOfOthers));
  const locked = Math.min(needed - exact - other, Math.max(0, lockedOfCard));
  return { exact, other, locked, missing: needed - exact - other - locked };
}

/** Per-deck lookups the band allocation reads, all resolved from the catalog. */
export interface OwnershipBandSources {
  /** Deck-building-available copies per printing id. */
  availableByPrinting: Record<string, number>;
  /** Deck-building-available copies per card, summed over all its printings. */
  availableByCardId: Record<string, number>;
  /** Locked-away copies per card (any printing, any lock reason). */
  lockedByCardId: Record<string, number>;
  /**
   * The printing each deck entry displays, keyed by {@link getDeckCardKey} —
   * the entry's pinned printing when it has one, otherwise the card's
   * language-preference canonical. Resolved through the same helper the
   * thumbnail uses, so band and image can't disagree.
   */
  displayedPrintingIdByCardKey: Record<string, string>;
}

/** A printing, as much of one as the band code needs. */
interface PrintingRef {
  id: string;
}

/**
 * Builds the per-deck lookups {@link buildOwnershipBands} needs from the
 * catalog. Kept separate from the allocation so the component's client-only
 * catalog bridge produces one stable object per data change.
 *
 * @param cards Every entry in the deck.
 * @param printingsByCardId The catalog's printings, grouped by card.
 * @param resolvePrinting Resolves the printing an entry displays — pass
 *   `getPreferredPrinting` from `usePreferredPrinting`.
 * @param availableByPrinting Deck-building-available copies per printing id.
 * @param lockedByPrinting Locked-away copies per printing id (any lock reason).
 * @returns The lookups, ready to hand to {@link buildOwnershipBands}.
 */
export function collectOwnershipBandSources(
  cards: readonly DeckBuilderCard[],
  printingsByCardId: ReadonlyMap<string, readonly PrintingRef[]>,
  resolvePrinting: (cardId: string, preferredPrintingId: string | null) => PrintingRef | undefined,
  availableByPrinting: Record<string, number>,
  lockedByPrinting: Record<string, number>,
): OwnershipBandSources {
  const availableByCardId: Record<string, number> = {};
  const lockedByCardId: Record<string, number> = {};
  const displayedPrintingIdByCardKey: Record<string, string> = {};
  for (const card of cards) {
    if (availableByCardId[card.cardId] === undefined) {
      let total = 0;
      let locked = 0;
      for (const printing of printingsByCardId.get(card.cardId) ?? []) {
        total += availableByPrinting[printing.id] ?? 0;
        locked += lockedByPrinting[printing.id] ?? 0;
      }
      availableByCardId[card.cardId] = total;
      lockedByCardId[card.cardId] = locked;
    }
    const displayed = resolvePrinting(card.cardId, card.preferredPrintingId);
    if (displayed) {
      displayedPrintingIdByCardKey[getDeckCardKey(card)] = displayed.id;
    }
  }
  return { availableByPrinting, availableByCardId, lockedByCardId, displayedPrintingIdByCardKey };
}

/**
 * @returns True when both records hold the same keys with the same values.
 */
function sameRecord<Value>(left: Record<string, Value>, right: Record<string, Value>): boolean {
  if (left === right) {
    return true;
  }
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) {
    return false;
  }
  for (const key of keys) {
    if (left[key] !== right[key]) {
      return false;
    }
  }
  return true;
}

/**
 * Content equality for two source sets. The catalog bridge publishes its
 * lookups into component state, so an equal-but-new object must not count as a
 * change: keeping the previous one lets React skip the re-render, which is what
 * stops a fresh object per render from feeding itself.
 * @returns True when both hold the same lookups.
 */
export function sameOwnershipBandSources(
  left: OwnershipBandSources | undefined,
  right: OwnershipBandSources | undefined,
): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return (
    sameRecord(left.availableByPrinting, right.availableByPrinting) &&
    sameRecord(left.availableByCardId, right.availableByCardId) &&
    sameRecord(left.lockedByCardId, right.lockedByCardId) &&
    sameRecord(left.displayedPrintingIdByCardKey, right.displayedPrintingIdByCardKey)
  );
}

/**
 * Overflow is a parking zone, not part of the deck, so it claims copies only
 * after every real zone has taken its share — mirroring `computeDeckOwnership`.
 * @returns True when the zone belongs to the deck proper.
 */
function isCountedZone(zone: string): boolean {
  return zone !== WellKnown.deckZone.OVERFLOW;
}

/**
 * Bands for every entry of a deck, keyed by {@link getDeckCardKey}. Built once
 * per render outside the thumbnail loops so the `.map()` callbacks close over a
 * stable value and stay cacheable under the React Compiler.
 *
 * A card can appear several times in one zone with different pinned printings,
 * so copies are allocated across entries rather than per entry: first every
 * entry claims copies of the printing it displays (in deck order, sharing one
 * pool per printing), then whatever is left of the card's copies fills the
 * remainders as "another printing". Both passes draw from one per-card pool, so
 * no copy is claimed twice — not by two entries of a zone, and not by two
 * zones.
 *
 * Entries with nothing owned (not even a locked copy) are left out of the map
 * entirely.
 *
 * @param cards Every entry in the deck.
 * @param sources Catalog lookups from {@link collectOwnershipBandSources}.
 * @param ownedPrintingByCardId The viewer's own printing per card, from
 *   `DeckOwnershipData`. Only consulted while "show my printings" is on.
 * @param preferOwned Whether the thumbnails currently show owned printings.
 * @returns Deck card key → segments, for the entries that carry a band.
 */
export function buildOwnershipBands(
  cards: readonly DeckBuilderCard[],
  sources: OwnershipBandSources,
  ownedPrintingByCardId:
    | ReadonlyMap<string, { id: string; imageId: string | undefined }>
    | undefined,
  preferOwned: boolean,
): Map<string, OwnershipBandSegments> {
  const ordered = cards.toSorted(
    (left, right) => Number(isCountedZone(right.zone)) - Number(isCountedZone(left.zone)),
  );

  const claimedByPrinting = new Map<string, number>();
  const claimedByCard = new Map<string, number>();
  const exactByCardKey = new Map<string, number>();

  // Pass 1 — the printing on screen. Running this for every entry before any
  // "other printing" is handed out keeps a later entry's own printing from
  // being spent as a substitute for an earlier one.
  for (const card of ordered) {
    const owned = preferOwned ? ownedPrintingByCardId?.get(card.cardId) : undefined;
    // The owned printing is shown only when it has art; otherwise the
    // thumbnail falls back to the entry's own printing.
    const displayedId = owned?.imageId
      ? owned.id
      : sources.displayedPrintingIdByCardKey[getDeckCardKey(card)];
    const cardLeft =
      (sources.availableByCardId[card.cardId] ?? 0) - (claimedByCard.get(card.cardId) ?? 0);
    const printingLeft = displayedId
      ? (sources.availableByPrinting[displayedId] ?? 0) - (claimedByPrinting.get(displayedId) ?? 0)
      : 0;
    const exact = Math.max(0, Math.min(card.quantity, printingLeft, cardLeft));
    exactByCardKey.set(getDeckCardKey(card), exact);
    if (exact > 0 && displayedId) {
      claimedByPrinting.set(displayedId, (claimedByPrinting.get(displayedId) ?? 0) + exact);
      claimedByCard.set(card.cardId, (claimedByCard.get(card.cardId) ?? 0) + exact);
    }
  }

  // Pass 2 — whatever copies of the card are still unclaimed cover the
  // remainders, in the same order. Locked copies fill after them, sharing one
  // per-card pool so a locked copy isn't drawn twice across zones.
  const claimedLockedByCard = new Map<string, number>();
  const bands = new Map<string, OwnershipBandSegments>();
  for (const card of ordered) {
    const key = getDeckCardKey(card);
    const cardLeft =
      (sources.availableByCardId[card.cardId] ?? 0) - (claimedByCard.get(card.cardId) ?? 0);
    const lockedLeft =
      (sources.lockedByCardId[card.cardId] ?? 0) - (claimedLockedByCard.get(card.cardId) ?? 0);
    const segments = ownershipBandSegments(
      card.quantity,
      exactByCardKey.get(key) ?? 0,
      cardLeft,
      lockedLeft,
    );
    if (segments.other > 0) {
      claimedByCard.set(card.cardId, (claimedByCard.get(card.cardId) ?? 0) + segments.other);
    }
    if (segments.locked > 0) {
      claimedLockedByCard.set(
        card.cardId,
        (claimedLockedByCard.get(card.cardId) ?? 0) + segments.locked,
      );
    }
    if (segments.exact > 0 || segments.other > 0 || segments.locked > 0) {
      bands.set(key, segments);
    }
  }
  return bands;
}

/**
 * Plain-language reading of a band, for the thumbnail's tooltip.
 * @returns One sentence naming the copies on hand.
 */
export function ownershipBandTitle(quantity: number, segments: OwnershipBandSegments): string {
  const { exact, other, locked } = segments;
  const needed = Math.max(0, quantity);
  const lockedSuffix =
    locked === 0 ? "" : locked === 1 ? ", 1 more is locked" : `, ${locked} more are locked`;
  if (exact === needed) {
    return needed === 1 ? "You own this printing" : `You own all ${needed} in this printing`;
  }
  if (other === needed) {
    return needed === 1
      ? "You own this card in another printing"
      : `You own all ${needed} in another printing`;
  }
  if (exact > 0 && other > 0) {
    return `You own ${exact} of ${needed} in this printing and ${other} in another${lockedSuffix}`;
  }
  if (exact > 0) {
    return `You own ${exact} of ${needed} in this printing${lockedSuffix}`;
  }
  if (other > 0) {
    return `You own ${other} of ${needed} in another printing${lockedSuffix}`;
  }
  if (locked === needed) {
    return needed === 1
      ? "You own this card, but it's locked"
      : `You own all ${needed}, but they're locked`;
  }
  return `You own ${locked} of ${needed}, but ${locked === 1 ? "it's" : "they're"} locked`;
}

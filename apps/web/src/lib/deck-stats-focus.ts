import type { DeckZone } from "@openrift/shared";
import { WellKnown } from "@openrift/shared";

import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { getDeckCardKey } from "@/lib/deck-builder-card";
import { chanceToDraw, OPENING_HAND_SIZE } from "@/lib/deck-draw-odds";
import type { OwnershipClass } from "@/lib/deck-stat-lenses";

/**
 * A stats-chart focus: clicking a bar on the Stats tab narrows the deck view
 * to the cards that bar counts. Mirrors the chart populations in
 * `use-deck-stats` (main deck + champion only).
 *
 * The rarity and ownership kinds carry their matching entries as a
 * precomputed key set: both need lookups a bare card doesn't hold (the
 * resolved printing, the collection split), so the chart's host resolves them
 * once at click time and the focus stays self-contained for every consumer.
 */
export type StatsFocus =
  | { kind: "energy"; value: number }
  | { kind: "power"; value: number }
  | { kind: "type"; value: string }
  | { kind: "rarity"; value: string; cardKeys: ReadonlySet<string> }
  | { kind: "ownership"; value: OwnershipClass; cardKeys: ReadonlySet<string> };

// The population the stats charts count — keep in sync with use-deck-stats.
const FOCUS_ZONES: ReadonlySet<DeckZone> = new Set([
  WellKnown.deckZone.MAIN,
  WellKnown.deckZone.CHAMPION,
]);

/**
 * Whether a deck card belongs to the focused chart column. Cards outside the
 * charts' population (legend, runes, battlefields, sideboard, overflow) never
 * match — focusing dims them along with the non-matching main-deck cards.
 * @returns True when the card is one the focused bar counts.
 */
export function cardMatchesStatsFocus(card: DeckBuilderCard, focus: StatsFocus): boolean {
  if (!FOCUS_ZONES.has(card.zone)) {
    return false;
  }
  switch (focus.kind) {
    case "energy": {
      return card.energy === focus.value;
    }
    case "power": {
      // The power curve counts powerless cards as 0 — match that here.
      return (card.power ?? 0) === focus.value;
    }
    case "type": {
      return card.cardTypes.includes(focus.value);
    }
    case "rarity":
    case "ownership": {
      return focus.cardKeys.has(getDeckCardKey(card));
    }
  }
}

/** Chip labels for the ownership classes. */
const OWNERSHIP_FOCUS_LABELS: Record<OwnershipClass, string> = {
  exact: "Cards owned as shown",
  other: "Cards owned in another printing",
  missing: "Cards with missing copies",
};

/**
 * Human label for the focus chip, e.g. "2-energy cards" or "Units".
 * @returns The label string.
 */
export function statsFocusLabel(
  focus: StatsFocus,
  typeLabels: Record<string, string>,
  rarityLabels: Record<string, string>,
): string {
  switch (focus.kind) {
    case "energy": {
      return `${focus.value}-energy cards`;
    }
    case "power": {
      return `${focus.value}-power cards`;
    }
    case "type": {
      return `${typeLabels[focus.value]}s`;
    }
    case "rarity": {
      return `${rarityLabels[focus.value]} cards`;
    }
    case "ownership": {
      return OWNERSHIP_FOCUS_LABELS[focus.value];
    }
  }
}

/**
 * Total copies the focused bar covers, for the chip's count.
 * @returns The summed quantity of matching cards.
 */
export function statsFocusCount(cards: readonly DeckBuilderCard[], focus: StatsFocus): number {
  return cards
    .filter((card) => cardMatchesStatsFocus(card, focus))
    .reduce((sum, card) => sum + card.quantity, 0);
}

/**
 * Chance of at least one focused card in the opening hand. Computed over the
 * drawn main deck only — the champion is part of the charts' population but
 * starts outside the drawn deck, so it doesn't count here.
 * @returns A probability in [0, 1], or null when no focused copies are drawable.
 */
export function statsFocusOpeningChance(
  cards: readonly DeckBuilderCard[],
  focus: StatsFocus,
): number | null {
  const mainCards = cards.filter((card) => card.zone === WellKnown.deckZone.MAIN);
  const deckSize = mainCards.reduce((sum, card) => sum + card.quantity, 0);
  const copies = mainCards
    .filter((card) => cardMatchesStatsFocus(card, focus))
    .reduce((sum, card) => sum + card.quantity, 0);
  if (deckSize === 0 || copies === 0) {
    return null;
  }
  return chanceToDraw(copies, deckSize, OPENING_HAND_SIZE);
}

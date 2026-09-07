import type { DeckZone } from "@openrift/shared/types/enums";
import { WellKnown } from "@openrift/shared/well-known";

import type { DeckBuilderCard } from "@/features/decks/lib/deck-builder-card";
import { getDeckCardKey } from "@/features/decks/lib/deck-builder-card";
import { chanceToDraw, OPENING_HAND_SIZE } from "@/features/decks/lib/deck-draw-odds";
import type { OwnershipClass } from "@/features/decks/lib/deck-stat-lenses";

export type StatsFocus =
  | { kind: "energy"; value: number }
  | { kind: "power"; value: number }
  | { kind: "type"; value: string }
  | { kind: "rarity"; value: string; cardKeys: ReadonlySet<string> }
  | { kind: "ownership"; value: OwnershipClass; cardKeys: ReadonlySet<string> };

// Keep in sync with the chart population in use-deck-stats.
const FOCUS_ZONES: ReadonlySet<DeckZone> = new Set([
  WellKnown.deckZone.MAIN,
  WellKnown.deckZone.CHAMPION,
]);

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

const OWNERSHIP_FOCUS_LABELS: Record<OwnershipClass, string> = {
  exact: "Cards owned as shown",
  other: "Cards owned in another printing",
  borrowed: "Cards borrowed from friends",
  missing: "Cards with missing copies",
};

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

export function statsFocusCount(cards: readonly DeckBuilderCard[], focus: StatsFocus): number {
  return cards
    .filter((card) => cardMatchesStatsFocus(card, focus))
    .reduce((sum, card) => sum + card.quantity, 0);
}

// Computed over the drawn main deck only: the champion starts outside it.
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

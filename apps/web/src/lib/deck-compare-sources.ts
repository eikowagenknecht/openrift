import type { Card, DeckListItemResponse, DeckZone, Printing } from "@openrift/shared";
import { legendDisplayName } from "@openrift/shared";

import type { DeckDiffCard } from "@/lib/deck-diff";
import { matchDeckEntries } from "@/lib/deck-import-matcher";
import type { DeckImportEntry } from "@/lib/deck-import-parsers";
import type { LocalDeck } from "@/lib/local-deck";

/** A deck of the user's own, offered as a source in the compare picker. */
export interface CompareDeckOption {
  id: string;
  name: string;
  cardCount: number;
}

/**
 * Fields a deck's own card rows contribute to the diff; satisfied by both
 * the server's `DeckCardResponse` and the browser store's `LocalDeckCard`.
 */
export interface OwnDeckCard {
  cardId: string;
  zone: DeckZone;
  quantity: number;
}

function localDeckCardCount(deck: LocalDeck): number {
  let total = 0;
  for (const card of deck.cards) {
    total += card.quantity;
  }
  return total;
}

export function collectCompareDeckOptions(
  openDeckId: string,
  serverDecks: readonly DeckListItemResponse[] | undefined,
  localDecks: Record<string, LocalDeck>,
): CompareDeckOption[] {
  const options: CompareDeckOption[] = [];
  for (const item of serverDecks ?? []) {
    if (item.deck.id === openDeckId || item.deck.archivedAt !== null) {
      continue;
    }
    options.push({ id: item.deck.id, name: item.deck.name, cardCount: item.totalCards });
  }
  for (const deck of Object.values(localDecks)) {
    if (deck.id === openDeckId) {
      continue;
    }
    options.push({ id: deck.id, name: deck.name, cardCount: localDeckCardCount(deck) });
  }
  return options.toSorted((optionA, optionB) => optionA.name.localeCompare(optionB.name));
}

export function ownDeckDiffCards(
  cards: readonly OwnDeckCard[],
  cardsById: Record<string, Card>,
): { theirs: DeckDiffCard[]; unmatched: string[] } {
  const theirs: DeckDiffCard[] = [];
  const unmatched: string[] = [];
  for (const card of cards) {
    const catalogCard = cardsById[card.cardId];
    if (!catalogCard) {
      unmatched.push(card.cardId);
      continue;
    }
    theirs.push({
      cardId: card.cardId,
      cardName: legendDisplayName(catalogCard),
      zone: card.zone,
      quantity: card.quantity,
    });
  }
  return { theirs, unmatched };
}

function unmatchedLabel(entry: DeckImportEntry): string {
  return entry.cardName ?? entry.shortCode ?? "";
}

export function diffCardsFromEntries(
  entries: DeckImportEntry[],
  allPrintings: Printing[],
): { cards: DeckDiffCard[]; unmatched: string[] } {
  const cards: DeckDiffCard[] = [];
  const unmatched: string[] = [];
  for (const match of matchDeckEntries(entries, allPrintings)) {
    if (!match.resolvedCard) {
      const label = unmatchedLabel(match.entry);
      if (label.length > 0) {
        unmatched.push(label);
      }
      continue;
    }
    cards.push({
      cardId: match.resolvedCard.cardId,
      cardName: match.resolvedCard.cardName,
      zone: match.zone,
      quantity: match.entry.quantity,
    });
  }
  return { cards, unmatched };
}

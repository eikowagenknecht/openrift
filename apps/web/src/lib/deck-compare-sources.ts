import type { Card, DeckListItemResponse, DeckZone, Printing } from "@openrift/shared";
import { legendDisplayName } from "@openrift/shared";

import type { DeckDiffCard } from "@/lib/deck-diff";
import { matchDeckEntries } from "@/lib/deck-import-matcher";
import type { DeckImportEntry } from "@/lib/deck-import-parsers";
import type { LocalDeck } from "@/stores/local-decks-store";

/** A deck of the user's own, offered as a source in the compare picker. */
export interface CompareDeckOption {
  id: string;
  name: string;
  /** Copies across every zone, shown so same-named decks stay tellable apart. */
  cardCount: number;
}

/**
 * The fields a deck's own card rows contribute to the diff. Both the server's
 * `DeckCardResponse` and the browser store's `LocalDeckCard` satisfy it.
 */
export interface OwnDeckCard {
  cardId: string;
  zone: DeckZone;
  quantity: number;
}

/** @returns Total copies across every zone of a browser-local deck. */
function localDeckCardCount(deck: LocalDeck): number {
  let total = 0;
  for (const card of deck.cards) {
    total += card.quantity;
  }
  return total;
}

/**
 * The decks the user can compare the open deck against: their server decks
 * plus this browser's local decks (ADR-035), minus the open deck itself.
 * Archived decks are left out — `decksQueryOptions` asks for them so the deck
 * list can show them, but they are not what someone reaches for here. The two
 * stores merge into one alphabetical list, since which of them a deck lives in
 * is not something the picker should make the user think about.
 *
 * @returns The options, sorted by name.
 */
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

/**
 * Resolves another of the user's own decks into diff cards. Its rows already
 * carry catalog ids, so this skips the parser and name matcher a pasted list
 * needs; only a card that has since left the catalog can fail to resolve, and
 * those come back as ids so the dialog can list them like unmatched lines.
 *
 * @returns The diff cards plus the card ids that resolved to nothing.
 */
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

/** @returns The text to show for a parsed line that matched no catalog card. */
function unmatchedLabel(entry: DeckImportEntry): string {
  return entry.cardName ?? entry.shortCode ?? "";
}

/**
 * Resolves parsed import entries into diff cards, matching each line against
 * the catalog the same way the import page does. A line that resolves to
 * nothing comes back as its raw label rather than being dropped silently, so
 * the comparison can say how much of the pasted list it could not read.
 *
 * @returns The diff cards plus the lines that resolved to nothing.
 */
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

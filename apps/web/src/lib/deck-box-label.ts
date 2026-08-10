/**
 * Wording for the deck-box markers: a collection that is some deck's physical
 * home says so on its sidebar row and page header, and the "Stored in" picker
 * warns before a second deck moves into an occupied box.
 */

/** The bit of a deck a label needs — the response carries more. */
interface NamedDeck {
  name: string;
}

/**
 * Names the decks stored in a collection. Two decks are both named, since
 * that's the case where knowing *which* still matters; beyond that the count
 * carries more than a truncated list would.
 * @returns The marker label, or undefined when no deck lives here.
 */
export function deckBoxLabel(homeDecks: readonly NamedDeck[]): string | undefined {
  const [first, second] = homeDecks;
  if (!first) {
    return undefined;
  }
  if (!second) {
    return `Deck box for ${first.name}`;
  }
  if (homeDecks.length === 2) {
    return `Deck box for ${first.name} and ${second.name}`;
  }
  return `Deck box for ${homeDecks.length} decks`;
}

/**
 * Warns that a collection is already some other deck's box. Sharing is allowed
 * (two decks really can live in one box), so this states the situation rather
 * than blocking it.
 * @returns The warning sentence, or undefined when the box is free.
 */
export function sharedBoxWarning(
  collectionName: string,
  otherDecks: readonly NamedDeck[],
): string | undefined {
  const [first] = otherDecks;
  if (!first) {
    return undefined;
  }
  if (otherDecks.length === 1) {
    return `${collectionName} is already the box for ${first.name}. Two decks can share one box.`;
  }
  return `${collectionName} is already the box for ${otherDecks.length} other decks. They can share it.`;
}

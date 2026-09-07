interface NamedDeck {
  name: string;
}

/**
 * Two decks are both named; beyond that the count carries more than a
 * truncated list would.
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

interface KeyedCard {
  key: string;
}

/** Fisher-Yates shuffle into a fresh array. */
export function shuffle<Value>(items: readonly Value[]): Value[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const swap = Math.floor(Math.random() * (index + 1));
    const held = result[index];
    const other = result[swap];
    if (held !== undefined && other !== undefined) {
      result[index] = other;
      result[swap] = held;
    }
  }
  return result;
}

// Recycles the set-aside cards to the library bottom in random order (rules 118, Recycle).
// `randomize` is the hook: inject {@link shuffle} in product code, identity in tests.
export function applyMulligan<Card extends KeyedCard>(
  hand: readonly Card[],
  library: readonly Card[],
  selectedKeys: ReadonlySet<string>,
  randomize: (cards: readonly Card[]) => Card[],
): { hand: Card[]; library: Card[] } {
  const kept = hand.filter((card) => !selectedKeys.has(card.key));
  const returned = hand.filter((card) => selectedKeys.has(card.key));
  const drawn = library.slice(0, returned.length);
  return {
    hand: [...kept, ...drawn],
    library: [...library.slice(returned.length), ...randomize(returned)],
  };
}

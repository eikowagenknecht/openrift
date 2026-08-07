/** A hand/library entry: one physical copy, uniquely keyed. */
interface KeyedCard {
  key: string;
}

/**
 * Fisher-Yates shuffle into a fresh array.
 * @returns The shuffled copy.
 */
export function shuffle<Value>(items: readonly Value[]): Value[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const swap = Math.floor(Math.random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

/**
 * Applies the Riftbound mulligan to a drawn hand: the selected cards are set
 * aside, that many replacements are drawn from the top of the library, and the
 * set-aside cards are Recycled to the bottom of the library in random order
 * (rules 118 and Recycle) — so later draws can still reach them.
 *
 * `randomize` orders the recycled cards; inject {@link shuffle} in product
 * code, an identity in tests.
 * @returns The new hand and library.
 */
export function applyMulligan<Card extends KeyedCard>(
  hand: readonly Card[],
  library: readonly Card[],
  selectedKeys: ReadonlySet<string>,
  randomize: (cards: readonly Card[]) => Card[],
): { hand: Card[]; library: Card[] } {
  const kept = hand.filter((card) => !selectedKeys.has(card.key));
  const exchanged = hand.filter((card) => selectedKeys.has(card.key));
  const drawn = library.slice(0, exchanged.length);
  return {
    hand: [...kept, ...drawn],
    library: [...library.slice(exchanged.length), ...randomize(exchanged)],
  };
}

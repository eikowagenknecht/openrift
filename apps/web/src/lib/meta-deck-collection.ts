import type { Marketplace, PriceLookup } from "@openrift/shared";

/** Card id to copies, per zone. */
export interface MetaDeckCards {
  main: ReadonlyMap<string, number>;
  side: ReadonlyMap<string, number>;
}

export type MetaDeckCardsByDeck = ReadonlyMap<string, MetaDeckCards>;

export interface MetaDeckCost {
  needed: number;
  /** Undefined when no collection is loaded. */
  owned: number | undefined;
  /** Undefined when any card has no price. */
  value: number | undefined;
  /** Undefined without a collection, or when a missing card has no price. */
  toComplete: number | undefined;
}

// A pair naming a card outside the pool is dropped, as is a trailing index without a quantity.
function decodePairs(pairs: readonly number[], cards: readonly string[]): Map<string, number> {
  const requirements = new Map<string, number>();
  for (let at = 0; at + 1 < pairs.length; at += 2) {
    const cardId = cards[pairs[at]];
    if (cardId === undefined) {
      continue;
    }
    requirements.set(cardId, (requirements.get(cardId) ?? 0) + pairs[at + 1]);
  }
  return requirements;
}

export function decodeMetaDeckCardIndex(index: {
  cards: readonly string[];
  decks: readonly { deckId: string; entries: readonly number[]; sideboard: readonly number[] }[];
}): Map<string, MetaDeckCards> {
  const byDeck = new Map<string, MetaDeckCards>();
  for (const deck of index.decks) {
    byDeck.set(deck.deckId, {
      main: decodePairs(deck.entries, index.cards),
      side: decodePairs(deck.sideboard, index.cards),
    });
  }
  return byDeck;
}

/**
 * Owned copies per card, summed over every printing of it. A reader who owns a
 * card in one printing owns it for a decklist's purposes — the archive records
 * which card was played, not which printing.
 */
export function ownedCountsByCardId(
  ownedByPrinting: Readonly<Record<string, number>>,
  printingsByCardId: ReadonlyMap<string, readonly { id: string }[]>,
): Map<string, number> {
  const owned = new Map<string, number>();
  for (const [cardId, printings] of printingsByCardId) {
    let total = 0;
    for (const printing of printings) {
      total += ownedByPrinting[printing.id] ?? 0;
    }
    if (total > 0) {
      owned.set(cardId, total);
    }
  }
  return owned;
}

/**
 * Currency major units. Printings in the reader's languages win; any other
 * language is a fallback. A card with no priced printing has no entry.
 */
export function cheapestPriceByCardId(
  printingsByCardId: ReadonlyMap<string, readonly { id: string; language: string }[]>,
  prices: PriceLookup,
  marketplace: Marketplace,
  languageOrder: readonly string[],
): Map<string, number> {
  const cheapest = new Map<string, number>();
  for (const [cardId, printings] of printingsByCardId) {
    const pools = [
      printings.filter((printing) => languageOrder.includes(printing.language)),
      printings,
    ];
    for (const pool of pools) {
      let best: number | undefined;
      for (const printing of pool) {
        const price = prices.get(printing.id, marketplace);
        if (price !== undefined && (best === undefined || price < best)) {
          best = price;
        }
      }
      if (best !== undefined) {
        cheapest.set(cardId, best);
        break;
      }
    }
  }
  return cheapest;
}

function scopedQuantities(cards: MetaDeckCards, includeSideboard: boolean): Map<string, number> {
  const quantities = new Map(cards.main);
  if (includeSideboard) {
    for (const [cardId, quantity] of cards.side) {
      quantities.set(cardId, (quantities.get(cardId) ?? 0) + quantity);
    }
  }
  return quantities;
}

/** Owned copies are capped per card at what the list plays. */
export function metaDeckCosts(
  decks: MetaDeckCardsByDeck,
  options: {
    includeSideboard: boolean;
    prices: ReadonlyMap<string, number>;
    ownedByCardId?: ReadonlyMap<string, number>;
  },
): Map<string, MetaDeckCost> {
  const byDeck = new Map<string, MetaDeckCost>();
  for (const [deckId, cards] of decks) {
    let needed = 0;
    let owned = 0;
    let value: number | undefined = 0;
    let toComplete: number | undefined = 0;
    for (const [cardId, quantity] of scopedQuantities(cards, options.includeSideboard)) {
      const price = options.prices.get(cardId);
      const held = Math.min(quantity, options.ownedByCardId?.get(cardId) ?? 0);
      needed += quantity;
      owned += held;
      if (price === undefined) {
        value = undefined;
      } else if (value !== undefined) {
        value += price * quantity;
      }
      const missing = quantity - held;
      if (price === undefined && missing > 0) {
        toComplete = undefined;
      } else if (toComplete !== undefined && price !== undefined) {
        toComplete += price * missing;
      }
    }
    const withCollection = options.ownedByCardId !== undefined;
    byDeck.set(deckId, {
      needed,
      owned: withCollection ? owned : undefined,
      value,
      toComplete: withCollection ? toComplete : undefined,
    });
  }
  return byDeck;
}

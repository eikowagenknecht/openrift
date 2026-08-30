import type { MetaDeckCardIndexResponse } from "@openrift/shared";

/** One archived list's card requirements: how many copies of each card it calls for. */
export type MetaDeckRequirements = ReadonlyMap<string, number>;

/** How much of one archived list the reader already holds. */
export interface MetaDeckOwnership {
  /** Copies of the list's cards the reader owns, capped at what the list calls for. */
  owned: number;
  /** Copies the known list calls for. Zero when the archive holds no cards of it. */
  needed: number;
}

/**
 * How much of a list the reader must already hold for it to count as mostly
 * buildable. A judgement about their own collection against one list, never
 * about the list itself and never against another list.
 *
 * Proportional rather than a fixed number of missing cards, because a partial
 * list can be half the size of a full one and "five cards short" means something
 * different in each.
 */
const MOSTLY_BUILDABLE_THRESHOLD = 0.8;

/**
 * Unpacks the archive's card index into per-deck requirements.
 *
 * The wire format pools card ids and refers to them by position, so this is
 * where the positions turn back into ids. A pair naming a card outside the pool
 * is dropped rather than trusted, and so is a trailing index with no quantity
 * behind it.
 */
export function decodeMetaDeckCardIndex(
  index: MetaDeckCardIndexResponse,
): Map<string, MetaDeckRequirements> {
  const byDeck = new Map<string, MetaDeckRequirements>();
  for (const deck of index.decks) {
    const requirements = new Map<string, number>();
    for (let at = 0; at + 1 < deck.entries.length; at += 2) {
      const cardId = index.cards[deck.entries[at]];
      if (cardId === undefined) {
        continue;
      }
      requirements.set(cardId, (requirements.get(cardId) ?? 0) + deck.entries[at + 1]);
    }
    byDeck.set(deck.deckId, requirements);
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
 * How much of one list the reader holds. Copies are capped per card: owning six
 * of a card a list plays three of covers three, not six.
 */
export function metaDeckOwnership(
  requirements: MetaDeckRequirements,
  ownedByCardId: ReadonlyMap<string, number>,
): MetaDeckOwnership {
  let owned = 0;
  let needed = 0;
  for (const [cardId, quantity] of requirements) {
    needed += quantity;
    owned += Math.min(quantity, ownedByCardId.get(cardId) ?? 0);
  }
  return { owned, needed };
}

/** {@link metaDeckOwnership} across the archive, keyed by deck id. */
export function metaDeckOwnershipByDeck(
  requirementsByDeck: ReadonlyMap<string, MetaDeckRequirements>,
  ownedByCardId: ReadonlyMap<string, number>,
): Map<string, MetaDeckOwnership> {
  const byDeck = new Map<string, MetaDeckOwnership>();
  for (const [deckId, requirements] of requirementsByDeck) {
    byDeck.set(deckId, metaDeckOwnership(requirements, ownedByCardId));
  }
  return byDeck;
}

/**
 * Whether the reader is close enough to holding this list for it to be worth
 * building. A list the archive holds no cards of is never close, however empty
 * the reader's collection is.
 */
export function isMostlyBuildable(ownership: MetaDeckOwnership): boolean {
  return ownership.needed > 0 && ownership.owned >= ownership.needed * MOSTLY_BUILDABLE_THRESHOLD;
}

/** The decks {@link isMostlyBuildable} passes, as the filter's membership test. */
export function mostlyBuildableDeckIds(
  ownershipByDeck: ReadonlyMap<string, MetaDeckOwnership>,
): Set<string> {
  const ids = new Set<string>();
  for (const [deckId, ownership] of ownershipByDeck) {
    if (isMostlyBuildable(ownership)) {
      ids.add(deckId);
    }
  }
  return ids;
}

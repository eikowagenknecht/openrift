import type { Printing } from "@openrift/shared";
import { getPlaysetSize } from "@openrift/shared";

import type { OwnedBucket } from "@/lib/search-schemas";

/**
 * Classify an owned-copy total into one of four buckets relative to a playset
 * size. The total is per-card or per-printing depending on the caller's
 * `bucketBy` choice (see {@link applyOwnedBucketFilter}).
 *
 * @returns The bucket the total falls into for the given playset size.
 */
export function bucketFor(total: number, playsetSize: number): OwnedBucket {
  if (total === 0) {
    return "none";
  }
  if (total < playsetSize) {
    return "partial";
  }
  if (total === playsetSize) {
    return "full";
  }
  return "extra";
}

/**
 * Filter printings by ownership bucket.
 *
 * - `bucketBy: "card"` (default) aggregates owned copies across all variants of
 *   a card, derives one bucket per card, and keeps every printing of a matching
 *   card. This is what cards view wants ("own a full playset of this card").
 * - `bucketBy: "printing"` buckets each printing on its own owned count, so a
 *   printing survives only when that individual variant matches a selected
 *   bucket. Printings view uses this, so "all but None" means "printings I own
 *   at least one of" rather than "any variant of a card I partly own".
 *
 * @returns Printings whose bucket is one of the selected ones.
 */
export function applyOwnedBucketFilter(
  cards: readonly Printing[],
  selected: readonly OwnedBucket[],
  ownedCountByPrinting: Record<string, number>,
  bucketBy: "card" | "printing" = "card",
): Printing[] {
  const selectedSet = new Set(selected);
  if (bucketBy === "printing") {
    return cards.filter((printing) =>
      selectedSet.has(
        bucketFor(
          ownedCountByPrinting[printing.id] ?? 0,
          getPlaysetSize(printing.card.type, printing.card.keywords),
        ),
      ),
    );
  }
  const totalByCard = new Map<string, number>();
  const cardById = new Map<string, Printing["card"]>();
  for (const printing of cards) {
    const count = ownedCountByPrinting[printing.id] ?? 0;
    totalByCard.set(printing.cardId, (totalByCard.get(printing.cardId) ?? 0) + count);
    if (!cardById.has(printing.cardId)) {
      cardById.set(printing.cardId, printing.card);
    }
  }
  const matchingCardIds = new Set<string>();
  for (const [cardId, total] of totalByCard) {
    const card = cardById.get(cardId);
    if (!card) {
      continue;
    }
    if (selectedSet.has(bucketFor(total, getPlaysetSize(card.type, card.keywords)))) {
      matchingCardIds.add(cardId);
    }
  }
  return cards.filter((printing) => matchingCardIds.has(printing.cardId));
}

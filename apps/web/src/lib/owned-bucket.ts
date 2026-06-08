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

/**
 * Filter printings by the exact number of copies owned, within an inclusive
 * range. This is the slider counterpart to the coarse-bucket
 * {@link applyOwnedBucketFilter} and uses the same card-vs-printing split:
 *
 * - `bucketBy: "card"` (default) aggregates owned copies across every variant of
 *   a card and keeps all printings of a card whose total falls in range.
 * - `bucketBy: "printing"` ranges each printing on its own owned count.
 *
 * `min`/`max` are inclusive. `null` means unbounded on that side (`min: null` →
 * zero and up; `max: null` → no upper limit).
 *
 * @returns Printings whose owned total is within [min, max].
 */
export function applyOwnedCountFilter(
  cards: readonly Printing[],
  min: number | null,
  max: number | null,
  ownedCountByPrinting: Record<string, number>,
  bucketBy: "card" | "printing" = "card",
): Printing[] {
  const lowerBound = min ?? 0;
  const upperBound = max ?? Infinity;
  if (bucketBy === "printing") {
    return cards.filter((printing) => {
      const count = ownedCountByPrinting[printing.id] ?? 0;
      return count >= lowerBound && count <= upperBound;
    });
  }
  const totalByCard = new Map<string, number>();
  for (const printing of cards) {
    const count = ownedCountByPrinting[printing.id] ?? 0;
    totalByCard.set(printing.cardId, (totalByCard.get(printing.cardId) ?? 0) + count);
  }
  return cards.filter((printing) => {
    const total = totalByCard.get(printing.cardId) ?? 0;
    return total >= lowerBound && total <= upperBound;
  });
}

/**
 * Largest owned total across a set of printings — the upper bound for the
 * "copies owned" range slider's track. Uses the same card-vs-printing
 * aggregation as {@link applyOwnedCountFilter}: in card mode it's the most
 * copies owned of any single card (summed across its variants); in printing
 * mode the most owned of any single printing.
 *
 * @returns The maximum owned total, or 0 when nothing is owned.
 */
export function maxOwnedCount(
  cards: readonly Printing[],
  ownedCountByPrinting: Record<string, number>,
  bucketBy: "card" | "printing" = "card",
): number {
  let max = 0;
  if (bucketBy === "printing") {
    for (const printing of cards) {
      const count = ownedCountByPrinting[printing.id] ?? 0;
      if (count > max) {
        max = count;
      }
    }
    return max;
  }
  const totalByCard = new Map<string, number>();
  for (const printing of cards) {
    const count = ownedCountByPrinting[printing.id] ?? 0;
    totalByCard.set(printing.cardId, (totalByCard.get(printing.cardId) ?? 0) + count);
  }
  for (const total of totalByCard.values()) {
    if (total > max) {
      max = total;
    }
  }
  return max;
}

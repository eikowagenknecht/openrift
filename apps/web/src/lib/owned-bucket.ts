import type { Printing } from "@openrift/shared";
import { getPlaysetSize } from "@openrift/shared";

import type { OwnedBucket } from "@/lib/search-schemas";

/**
 * Classify a card's total owned copies into one of four buckets. Counts are
 * always aggregated per-card across all variants — the bucket then applies to
 * every printing of that card, so picking "Full" in printings view shows every
 * variant of a card whose playset is complete.
 *
 * @returns The bucket the card falls into for the given total and playset size.
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
 * Filter printings by their parent card's ownership bucket. The card-aggregated
 * total is compared against the playset size to derive a single bucket per
 * card; a printing survives if that bucket is one of the selected ones.
 *
 * @returns Printings whose parent card matches at least one selected bucket.
 */
export function applyOwnedBucketFilter(
  cards: readonly Printing[],
  selected: readonly OwnedBucket[],
  ownedCountByPrinting: Record<string, number>,
): Printing[] {
  const selectedSet = new Set(selected);
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

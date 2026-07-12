import type { CollectionResponse } from "@openrift/shared";

/**
 * Aggregate market value and unpriced-copy count for the "All Cards" total on
 * the collections index, where no single collection is selected.
 *
 * Shared friend-group collections are excluded: their copies are communal cards
 * contributed by group members, not the viewer's own, so folding them into the
 * viewer's headline "worth" is misleading (an empty personal collection would
 * still show a non-zero total). A specific group collection viewed on its own
 * still reports its value via `currentCollection.totalValueCents` — this helper
 * only governs the aggregate.
 *
 * @param collections The full accessible collection list (personal + group).
 * @returns Summed `valueCents` and `unpricedCount` over personal collections only.
 */
export function aggregatePersonalCollectionValue(collections: readonly CollectionResponse[]): {
  valueCents: number;
  unpricedCount: number;
} {
  return collections.reduce(
    (acc, collection) => {
      // Skip shared group collections (non-null groupId) — communal, not owned.
      if (collection.groupId) {
        return acc;
      }
      return {
        valueCents: acc.valueCents + (collection.totalValueCents ?? 0),
        unpricedCount: acc.unpricedCount + (collection.unpricedCopyCount ?? 0),
      };
    },
    { valueCents: 0, unpricedCount: 0 },
  );
}

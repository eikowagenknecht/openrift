/**
 * Client-side cover-art derivation for the viewer's own (and group-pooled)
 * collections, from the synced copies store. Mirrors the server-side ranking
 * in `copiesRepo.coverPrintingsAcross` — most-copies-first — so a collection
 * shows the same fan whether its covers came from the API (member shares) or
 * were derived locally (group collections). The client store carries no
 * per-copy timestamp, so ties break on printing id for a stable order.
 */

/**
 * Picks up to `limit` representative printings per collection, ranked by how
 * many copies the collection holds of each (ties by printing id).
 *
 * @param copies The copies to derive from (typically the full synced store).
 * @param limit Max printings per collection.
 * @returns Printing ids in fan display order, keyed by collection id.
 */
export function deriveCollectionCovers(
  copies: readonly { collectionId: string; printingId: string }[],
  limit: number,
): Map<string, string[]> {
  const countsByCollection = new Map<string, Map<string, number>>();
  for (const copy of copies) {
    let counts = countsByCollection.get(copy.collectionId);
    if (!counts) {
      counts = new Map();
      countsByCollection.set(copy.collectionId, counts);
    }
    counts.set(copy.printingId, (counts.get(copy.printingId) ?? 0) + 1);
  }
  return new Map(
    [...countsByCollection].map(([collectionId, counts]) => [
      collectionId,
      [...counts]
        .toSorted(([aId, aCount], [bId, bCount]) => bCount - aCount || aId.localeCompare(bId))
        .slice(0, limit)
        .map(([printingId]) => printingId),
    ]),
  );
}

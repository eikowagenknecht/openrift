/**
 * Mirrors the server-side ranking in `copiesRepo.coverPrintingsAcross`
 * (most-copies-first, ties by printing id) so a collection's fan matches
 * regardless of whether covers came from the API or were derived locally.
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

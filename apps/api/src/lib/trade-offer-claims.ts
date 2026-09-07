/**
 * Allocates oldest offer first; receiver-initiated offers claim nothing.
 * Must agree with `assertSupplyAvailable`, `autoCancelUnfillablePendingTrades`, and the friend-group-matches view.
 */
export function claimCopiesForOffers<
  TOffer extends { id: string; groupId: string; quantity: number },
>(
  offers: readonly TOffer[],
  supplyByGroup: ReadonlyMap<string, readonly string[]>,
): { claimed: Set<string>; unfillable: TOffer[] } {
  const claimed = new Set<string>();
  const unfillable: TOffer[] = [];
  for (const offer of offers) {
    const free = (supplyByGroup.get(offer.groupId) ?? []).filter((copyId) => !claimed.has(copyId));
    if (free.length < offer.quantity) {
      unfillable.push(offer);
      continue;
    }
    for (const copyId of free.slice(0, offer.quantity)) {
      claimed.add(copyId);
    }
  }
  return { claimed, unfillable };
}

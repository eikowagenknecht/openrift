/**
 * Allocates a giver's visible copies to their live pending offers, oldest
 * first. An offer only claims copies the group it lives in can actually see, so
 * a giver who shares different copies with different groups is never falsely
 * emptied out. An offer that no longer fits claims nothing and is reported back
 * as unfillable.
 *
 * An offer (`initiator = 'giver'`) is a commitment the giver made, and nothing
 * is pinned until the recipient accepts, so this pass is the only thing that
 * keeps the copy off the table in the meantime. It refines ADR-019's "a pending
 * request reserves nothing" rule, which still holds for the request direction:
 * receiver-initiated pending rows are bids and claim no copies, so several
 * members may ask for one card and the giver picks.
 *
 * The three callers must agree on the result or the app contradicts itself:
 * `assertSupplyAvailable` and `autoCancelUnfillablePendingTrades` (both in
 * `services/card-trades.ts`) decide what a new trade may claim and which stale
 * ones die, and the match view (`repositories/friend-group-matches.ts`) hides
 * the claimed copies so a member never sees a card they cannot request.
 * Counting offers globally instead would refuse a second offer whenever the
 * first one lives in another group, even when the two draw on different copies.
 * @param offers The giver's live offers for one printing, oldest first.
 * @param supplyByGroup Group id to the copy ids that group's shares can see.
 * @returns The copy ids claimed by a surviving offer, and the offers that no longer fit.
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

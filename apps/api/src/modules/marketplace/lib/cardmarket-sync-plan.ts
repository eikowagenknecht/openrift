import type { CardmarketResolvedRow } from "./cardmarket-stock-resolve.js";

export interface CardmarketSyncKey {
  printingId: string;
  conditionSlug: string;
  isAltered: boolean;
}

interface CardmarketSyncCounts {
  intent: number;
  observed: number;
  intentBase: number;
  observedBase: number;
  unmanaged: number;
}

export interface CardmarketSyncEntry extends CardmarketSyncCounts {
  key: CardmarketSyncKey;
}

export interface CardmarketSyncAction extends CardmarketSyncCounts {
  key: CardmarketSyncKey;
  departed: number;
  appeared: number;
  list: number;
  delist: number;
}

function clampToZero(value: number): number {
  return Math.max(value, 0);
}

// A departure is resolved as a sale before the listing delta. Unmanaged
// articles stay out of the delta, or the plan would delete hand-listed stock.
export function planCardmarketSync(
  entries: readonly CardmarketSyncEntry[],
): CardmarketSyncAction[] {
  return entries.map((entry) => {
    const departed = clampToZero(entry.observedBase - entry.observed);
    const appeared = clampToZero(entry.observed - entry.observedBase);

    const projectedIntent = clampToZero(entry.intent - departed);
    const managedObserved = clampToZero(entry.observed - entry.unmanaged);

    return {
      ...entry,
      departed,
      appeared,
      list: clampToZero(projectedIntent - managedObserved),
      delist: clampToZero(managedObserved - projectedIntent),
    };
  });
}

export function isCardmarketSyncActionable(action: CardmarketSyncAction): boolean {
  return action.departed > 0 || action.appeared > 0 || action.list > 0 || action.delist > 0;
}

export function cardmarketSyncKeyOf(key: CardmarketSyncKey): string {
  return `${key.printingId}::${key.conditionSlug}::${key.isAltered ? "altered" : "plain"}`;
}

// Several Cardmarket products can resolve to the same printing, so this sums
// across them rather than reading them as separate listings.
export function observedCountsFromResolved(
  resolved: readonly CardmarketResolvedRow[],
): Map<string, { key: CardmarketSyncKey; observed: number }> {
  const counts = new Map<string, { key: CardmarketSyncKey; observed: number }>();

  for (const { row, printingId, conditionSlug } of resolved) {
    const key: CardmarketSyncKey = { printingId, conditionSlug, isAltered: row.isAltered };
    const id = cardmarketSyncKeyOf(key);
    const existing = counts.get(id);
    if (existing) {
      existing.observed += row.amount;
    } else {
      counts.set(id, { key, observed: row.amount });
    }
  }

  return counts;
}

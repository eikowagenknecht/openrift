import type { Printing } from "@openrift/shared";
import { legendDisplayName } from "@openrift/shared";

import { CardCountStrip } from "@/components/cards/card-count-strip";
import { useHydrated } from "@/hooks/use-hydrated";
import { useOwnedCountsForPrintings } from "@/hooks/use-owned-count";
import { dispatchDecrement, dispatchIncrement } from "@/stores/card-row-actions-store";

/**
 * `useOwnedCountsForPrintings` is a live query, so the count is gated behind
 * hydration like every other consumer.
 */
export function PrintingCountActions({
  printing,
  collectionId,
  siblingIds,
}: {
  printing: Printing;
  /** Scopes the primary count to one collection. Omit for the count across all of them. */
  collectionId?: string;
  /** Variants of the same card to widen the total across. Defaults to this printing alone. */
  siblingIds?: readonly string[];
}) {
  const hydrated = useHydrated();
  const { data: counts } = useOwnedCountsForPrintings(
    siblingIds ?? [printing.id],
    hydrated,
    collectionId,
  );
  const ownedCount = counts?.totals[printing.id] ?? 0;
  const totalCount = counts?.allTotal ?? 0;
  const cardName = legendDisplayName(printing.card);

  return (
    <CardCountStrip
      count={ownedCount}
      totalCount={totalCount}
      decrement={
        ownedCount > 0
          ? {
              onClick: (event) => dispatchDecrement(printing, event.currentTarget),
              ariaLabel: `Remove ${cardName}`,
            }
          : undefined
      }
      increment={{
        onClick: () => dispatchIncrement(printing),
        ariaLabel: `Add ${cardName}`,
      }}
    />
  );
}

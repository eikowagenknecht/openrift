import type { Printing } from "@openrift/shared";
import { legendDisplayName } from "@openrift/shared";

import { CardCountStrip } from "@/components/cards/card-count-strip";
import { useHydrated } from "@/hooks/use-hydrated";
import { useOwnedCountsForPrintings } from "@/hooks/use-owned-count";
import { dispatchDecrement, dispatchIncrement } from "@/stores/card-row-actions-store";

/**
 * Add/remove controls for the card shown in the collection detail overlay,
 * so opening a card mid-sort doesn't take away the +/- that were on its tile.
 *
 * Deliberately narrower than the grid tile's strip: this is a printing, not one
 * specific copy, so the copy-level chips (loan, trade, metadata) have no anchor
 * here and stay on the tile they describe.
 *
 * `useOwnedCountsForPrintings` is a live query, so the count is gated behind
 * hydration like every other consumer.
 * @returns The collection add/remove strip.
 */
export function CollectionDetailActions({
  printing,
  collectionId,
}: {
  printing: Printing;
  collectionId?: string;
}) {
  const hydrated = useHydrated();
  const { data: counts } = useOwnedCountsForPrintings([printing.id], hydrated, collectionId);
  const ownedCount = counts?.totals[printing.id] ?? 0;
  const totalCount = counts?.allTotals[printing.id] ?? 0;
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

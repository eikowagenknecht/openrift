import type { Printing } from "@openrift/shared";
import { legendDisplayName } from "@openrift/shared";

import { CardCountStrip } from "@/components/cards/card-count-strip";
import { useHydrated } from "@/hooks/use-hydrated";
import { useOwnedCountsForPrintings } from "@/hooks/use-owned-count";
import { dispatchDecrement, dispatchIncrement } from "@/stores/card-row-actions-store";

/**
 * Add/remove controls for the card shown in a detail overlay, so opening a card
 * mid-sort doesn't take away the +/- that were on its tile. Shared by
 * /collections (primary count scoped to the open collection) and /cards
 * (primary count global, total widened across the card's variants).
 *
 * Deliberately narrower than the grid tile's strip: this is a printing, not one
 * specific copy, so the copy-level chips (loan, trade, metadata) have no anchor
 * here and stay on the tile they describe.
 *
 * The parenthesised total is the count widened along whichever axis the caller
 * opened up: every collection when `collectionId` narrows the primary count,
 * every variant when `siblingIds` names them.
 *
 * `useOwnedCountsForPrintings` is a live query, so the count is gated behind
 * hydration like every other consumer.
 * @returns The add/remove strip.
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

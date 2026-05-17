import type { Printing } from "@openrift/shared";

import { CountWithAddControls } from "@/components/cards/count-with-add-controls";
import { useOwnedCountFor, useOwnedCountsForPrintings } from "@/hooks/use-owned-count";

interface CollectionTableActionsProps {
  printing: Printing;
  /**
   * Scopes the count to a specific collection. When omitted (the "All cards"
   * view across every collection), the count is global and the `(M)` hint
   * never appears.
   */
  collectionId?: string;
  /**
   * True when the page is in add mode. Browse mode shows the in-collection
   * count with the global figure as the `(M)` hint; add mode shows the
   * per-printing count scoped to the collection with the variant-aggregate
   * (in this collection) as the `(M)` hint, matching the grid's add strip.
   */
  isAddMode: boolean;
  /**
   * Sibling printing IDs of the same card (cards view) for the variant
   * aggregate. Omit for printings view.
   */
  siblingIds?: readonly string[];
}

const EMPTY_SIBLING_IDS: readonly string[] = [];

/**
 * Actions cell for the /collections table. Always renders the +/- buttons via
 * {@link CountWithAddControls}, with count semantics that switch on
 * `isAddMode`:
 *
 *  - Browse mode: primary = in-collection (sibling-aggregated in cards view),
 *    `(M)` hint = the same count across every collection.
 *  - Add mode: primary = per-printing in this collection, `(M)` hint = the
 *    sibling aggregate in this collection (matches the grid's add strip).
 *
 * @returns The collection actions content (no wrapper — CardTableRow renders that).
 */
export function CollectionTableActions({
  printing,
  collectionId,
  isAddMode,
  siblingIds,
}: CollectionTableActionsProps) {
  const hasSiblings = siblingIds !== undefined && siblingIds.length > 0;
  const { data: single } = useOwnedCountFor(printing.id, !hasSiblings, collectionId);
  const { data: siblings } = useOwnedCountsForPrintings(
    siblingIds ?? EMPTY_SIBLING_IDS,
    hasSiblings,
    collectionId,
  );

  let ownedCount: number;
  let totalOwnedCount: number | undefined;
  if (hasSiblings) {
    if (isAddMode) {
      ownedCount = siblings?.totals[printing.id] ?? 0;
      totalOwnedCount = siblings?.total;
    } else {
      ownedCount = siblings?.total ?? 0;
      totalOwnedCount = siblings?.allTotal;
    }
  } else {
    ownedCount = single?.count ?? 0;
    totalOwnedCount = isAddMode ? undefined : single?.totalCount;
  }

  return (
    <CountWithAddControls
      printing={printing}
      ownedCount={ownedCount}
      totalOwnedCount={totalOwnedCount}
    />
  );
}

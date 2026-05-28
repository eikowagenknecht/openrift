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
   * Sibling printing IDs of the same card (cards view) for the variant
   * aggregate. Omit for printings view.
   */
  siblingIds?: readonly string[];
}

const EMPTY_SIBLING_IDS: readonly string[] = [];

/**
 * Actions cell for the /collections table. Always renders the +/- buttons via
 * {@link CountWithAddControls}. The primary count is the per-printing
 * in-collection count; the `(M)` hint is the variant aggregate in the same
 * collection (printings view collapses both to a single number).
 *
 * @returns The collection actions content (no wrapper — CardTableRow renders that).
 */
export function CollectionTableActions({
  printing,
  collectionId,
  siblingIds,
}: CollectionTableActionsProps) {
  const hasSiblings = siblingIds !== undefined && siblingIds.length > 0;
  const { data: single } = useOwnedCountFor(printing.id, !hasSiblings, collectionId);
  const { data: siblings } = useOwnedCountsForPrintings(
    siblingIds ?? EMPTY_SIBLING_IDS,
    hasSiblings,
    collectionId,
  );

  const ownedCount = hasSiblings ? (siblings?.totals[printing.id] ?? 0) : (single?.count ?? 0);
  const totalOwnedCount = hasSiblings ? siblings?.total : undefined;

  return (
    <CountWithAddControls
      printing={printing}
      ownedCount={ownedCount}
      totalOwnedCount={totalOwnedCount}
    />
  );
}

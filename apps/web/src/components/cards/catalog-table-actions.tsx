import type { Printing } from "@openrift/shared";

import { CountWithAddControls } from "@/components/cards/count-with-add-controls";
import { useOwnedCountFor, useOwnedCountsForPrintings } from "@/hooks/use-owned-count";

interface CatalogTableActionsProps {
  printing: Printing;
  /** True when the page is in add mode — renders +/- buttons next to the count. */
  isAddMode: boolean;
  /**
   * Sibling printing IDs of the same card (cards view) for the variant-aggregate
   * `(M)` hint in add mode. Omit for browse mode or printings view.
   */
  siblingIds?: readonly string[];
}

const EMPTY_SIBLING_IDS: readonly string[] = [];

/**
 * Actions cell for the /cards catalog table. Browse mode shows a read-only
 * `×N` owned count; add mode adds +/- buttons via {@link CountWithAddControls}.
 * In cards view + add mode, the parent passes `siblingIds` so the cell
 * displays the per-printing count with the variant aggregate as a `(M)` hint
 * (matching the grid's CollectionAddStrip).
 *
 * @returns The catalog actions content (no wrapper — CardTableRow renders that).
 */
export function CatalogTableActions({ printing, isAddMode, siblingIds }: CatalogTableActionsProps) {
  const hasSiblings = siblingIds !== undefined && siblingIds.length > 0;
  // Two hooks, one enabled at a time — calling rules require unconditional hook order.
  const { data: single } = useOwnedCountFor(printing.id, !hasSiblings);
  const { data: siblings } = useOwnedCountsForPrintings(
    siblingIds ?? EMPTY_SIBLING_IDS,
    hasSiblings,
  );

  // In add mode + cards view, primary = this printing's count and the
  // (M) hint = the sibling aggregate. Browse mode (or printings view)
  // shows a single per-printing count.
  const ownedCount = hasSiblings ? (siblings?.totals[printing.id] ?? 0) : (single?.count ?? 0);
  const totalOwnedCount = hasSiblings && isAddMode ? siblings?.total : undefined;

  if (!isAddMode) {
    return ownedCount > 0 ? `×${ownedCount}` : "";
  }

  return (
    <CountWithAddControls
      printing={printing}
      ownedCount={ownedCount}
      totalOwnedCount={totalOwnedCount}
    />
  );
}

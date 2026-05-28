import type { Printing } from "@openrift/shared";

import { useOwnedCountFor, useOwnedCountsForPrintings } from "@/hooks/use-owned-count";

interface CatalogTableActionsProps {
  printing: Printing;
  /**
   * Sibling printing IDs of the same card (cards view) for the variant-aggregate
   * `(M)` hint. Omit for printings view (no aggregate).
   */
  siblingIds?: readonly string[];
}

const EMPTY_SIBLING_IDS: readonly string[] = [];

/**
 * Actions cell for the /cards catalog table. Renders a read-only owned count:
 * `×N` for a single printing, `×N (M)` in cards view when the user owns more
 * than one variant of the card (M = per-card sum). Empty when nothing owned.
 *
 * @returns The catalog actions content (no wrapper — CardTableRow renders that).
 */
export function CatalogTableActions({ printing, siblingIds }: CatalogTableActionsProps) {
  const hasSiblings = siblingIds !== undefined && siblingIds.length > 0;
  // Two hooks, one enabled at a time — calling rules require unconditional hook order.
  const { data: single } = useOwnedCountFor(printing.id, !hasSiblings);
  const { data: siblings } = useOwnedCountsForPrintings(
    siblingIds ?? EMPTY_SIBLING_IDS,
    hasSiblings,
  );

  const ownedCount = hasSiblings ? (siblings?.totals[printing.id] ?? 0) : (single?.count ?? 0);
  const ownedVariantCount =
    hasSiblings && siblings
      ? Object.values(siblings.totals).filter((count) => count > 0).length
      : 0;
  const cardTotal = hasSiblings ? (siblings?.total ?? 0) : ownedCount;

  if (cardTotal === 0) {
    return "";
  }
  if (hasSiblings && ownedVariantCount > 1) {
    return `×${ownedCount} (${cardTotal})`;
  }
  return `×${ownedCount}`;
}

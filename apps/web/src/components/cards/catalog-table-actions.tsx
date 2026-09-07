import type { Printing } from "@openrift/shared/types/catalog";

import { CountWithAddControls } from "@/components/cards/count-with-add-controls";
import { useOwnedCountFor, useOwnedCountsForPrintings } from "@/hooks/use-owned-count";

interface CatalogTableActionsProps {
  printing: Printing;
  siblingIds?: readonly string[];
}

const EMPTY_SIBLING_IDS: readonly string[] = [];

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

  return (
    <CountWithAddControls
      printing={printing}
      ownedCount={ownedCount}
      totalOwnedCount={ownedVariantCount > 1 ? cardTotal : undefined}
    />
  );
}

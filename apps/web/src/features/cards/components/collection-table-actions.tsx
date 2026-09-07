import type { Printing } from "@openrift/shared/types/catalog";

import { CountWithAddControls } from "@/features/cards/components/count-with-add-controls";
import {
  useOwnedCountFor,
  useOwnedCountsForPrintings,
} from "@/features/collections/hooks/use-owned-count";

interface CollectionTableActionsProps {
  printing: Printing;
  collectionId?: string;
  siblingIds?: readonly string[];
}

const EMPTY_SIBLING_IDS: readonly string[] = [];

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

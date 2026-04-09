import type { Printing } from "@openrift/shared";
import { useState } from "react";

import { useBatchedAddCopies, useDisposeCopies } from "@/hooks/use-copies";
import { useAddModeStore } from "@/stores/add-mode-store";

/**
 * Shared add/undo logic for collection add mode, with optimistic owned-count deltas.
 * Used by both the /cards catalog browser and the /collections add-mode grid.
 * @returns Quick-add actions and optimistic count helpers, or undefined handlers when disabled.
 */
export function useQuickAddActions(collectionId?: string) {
  const batchedAdd = useBatchedAddCopies();
  const disposeCopies = useDisposeCopies();
  const [countDeltas, setCountDeltas] = useState<Record<string, number>>({});

  const handleQuickAdd = collectionId
    ? async (printing: Printing) => {
        const pid = printing.id;
        setCountDeltas((prev) => ({ ...prev, [pid]: (prev[pid] ?? 0) + 1 }));
        useAddModeStore.getState().incrementPending(printing);
        try {
          const result = await batchedAdd.add(pid, collectionId);
          // onSuccess already updated the query cache — remove our optimistic delta
          setCountDeltas((prev) => ({ ...prev, [pid]: (prev[pid] ?? 0) - 1 }));
          useAddModeStore.getState().recordAdd(printing, result.id);
        } catch {
          setCountDeltas((prev) => ({ ...prev, [pid]: (prev[pid] ?? 0) - 1 }));
        } finally {
          useAddModeStore.getState().decrementPending(pid);
        }
      }
    : undefined;

  const handleUndoAdd = collectionId
    ? async (printing: Printing) => {
        const entry = useAddModeStore.getState().addedItems.get(printing.id);
        if (!entry || entry.copyIds.length === 0) {
          return;
        }
        const copyIdToRemove = entry.copyIds.at(-1);
        if (!copyIdToRemove) {
          return;
        }
        const pid = printing.id;
        setCountDeltas((prev) => ({ ...prev, [pid]: (prev[pid] ?? 0) - 1 }));
        useAddModeStore.getState().recordUndo(pid);
        try {
          await disposeCopies.mutateAsync({ copyIds: [copyIdToRemove] });
        } catch {
          setCountDeltas((prev) => ({ ...prev, [pid]: (prev[pid] ?? 0) + 1 }));
          useAddModeStore.getState().recordAdd(printing, copyIdToRemove);
        }
      }
    : undefined;

  const handleOpenVariants = collectionId
    ? (printing: Printing, anchorEl: HTMLElement) => {
        const rect = anchorEl.getBoundingClientRect();
        useAddModeStore.getState().openVariants(printing.card.id, {
          top: rect.bottom + 4,
          left: Math.max(
            8,
            Math.min(rect.left + rect.width / 2 - 112, globalThis.innerWidth - 232),
          ),
        });
      }
    : undefined;

  /**
   * Returns the owned count adjusted by optimistic deltas.
   * @returns The adjusted count.
   */
  const adjustedCount = (printingId: string, baseCount: number) =>
    baseCount + (countDeltas[printingId] ?? 0);

  return { handleQuickAdd, handleUndoAdd, handleOpenVariants, countDeltas, adjustedCount };
}

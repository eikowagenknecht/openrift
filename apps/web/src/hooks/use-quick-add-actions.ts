import type { Printing } from "@openrift/shared";
import { useRef, useState } from "react";

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

  // Track the card whose popover was just closed so the click-through from the
  // mousedown close-outside handler doesn't immediately reopen it.
  const justClosedRef = useRef<string | null>(null);

  const handleOpenVariants = collectionId
    ? (printing: Printing, anchorEl: HTMLElement) => {
        const rect = anchorEl.getBoundingClientRect();
        if (justClosedRef.current === printing.cardId) {
          justClosedRef.current = null;
          return;
        }
        const current = useAddModeStore.getState().variantPopover;
        if (current?.cardId === printing.cardId) {
          useAddModeStore.getState().closeVariants();
          justClosedRef.current = printing.cardId;
          return;
        }
        useAddModeStore.getState().openVariants(printing.cardId, {
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

  /** Close the variant popover and mark it as just-closed to prevent reopen on click-through. */
  const closeVariants = () => {
    const current = useAddModeStore.getState().variantPopover;
    if (current) {
      justClosedRef.current = current.cardId;
    }
    useAddModeStore.getState().closeVariants();
  };

  return {
    handleQuickAdd,
    handleUndoAdd,
    handleOpenVariants,
    closeVariants,
    countDeltas,
    adjustedCount,
  };
}

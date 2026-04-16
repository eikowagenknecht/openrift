import type { Printing } from "@openrift/shared";
import { useRef } from "react";

import { useBatchedAddCopies, useDisposeCopies } from "@/hooks/use-copies";
import { useAddModeStore } from "@/stores/add-mode-store";

/**
 * Shared add/undo logic for collection add mode. Optimistic count changes
 * flow through the copies collection (via TanStack DB writes), so this hook
 * no longer maintains a parallel optimistic counter. The add-mode-store
 * keeps its session history for undo (tracking which real copy ids were
 * added, so undo removes the most recent rather than an arbitrary copy).
 * @returns Quick-add actions, or undefined handlers when disabled.
 */
export function useQuickAddActions(collectionId?: string) {
  const batchedAdd = useBatchedAddCopies();
  const disposeCopies = useDisposeCopies();

  const handleQuickAdd = collectionId
    ? async (printing: Printing) => {
        useAddModeStore.getState().incrementPending(printing);
        try {
          const { result } = batchedAdd.add(printing.id, collectionId);
          const real = await result;
          useAddModeStore.getState().recordAdd(printing, real.id);
        } catch {
          // Error toast is fired by the global mutation onError handler;
          // swallow the rejection here so it doesn't surface as an uncaught
          // promise in the console.
        } finally {
          useAddModeStore.getState().decrementPending(printing.id);
        }
      }
    : undefined;

  const handleUndoAdd = collectionId
    ? async (printing: Printing) => {
        const entry = useAddModeStore.getState().addedItems.get(printing.id);
        const copyIdToRemove = entry?.copyIds.at(-1);
        if (!copyIdToRemove) {
          return;
        }
        useAddModeStore.getState().recordUndo(printing.id);
        try {
          await disposeCopies.mutateAsync({ copyIds: [copyIdToRemove] });
        } catch {
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
   * Kept for API compatibility with callers that want a helper; counts now
   * come straight from the copies collection via useOwnedCount, so no
   * adjustment is needed.
   * @returns The owned count as-is.
   */
  const adjustedCount = (_printingId: string, baseCount: number) => baseCount;

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
    adjustedCount,
  };
}

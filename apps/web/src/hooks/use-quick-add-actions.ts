import type { Printing } from "@openrift/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";

import { useBatchedAddCopies, useDisposeCopies } from "@/hooks/use-copies";
import { decideRemoval, pickNewestCopy } from "@/hooks/use-quick-add-actions-helpers";
import { getCopiesCollection } from "@/lib/copies-collection";
import { useAddModeStore } from "@/stores/add-mode-store";

/**
 * Shared add/undo logic for collection add mode. Optimistic count changes
 * flow through the copies collection (via TanStack DB writes), so this hook
 * no longer maintains a parallel optimistic counter. The add-mode-store
 * keeps its session history for undo (tracking which real copy ids were
 * added, so undo removes the most recent rather than an arbitrary copy).
 *
 * `addTarget` is where new copies are inserted (specific collection id, or
 * the inbox id on All Cards). `viewCollectionId` scopes the minus button:
 * when set, minus only removes copies from that collection. When undefined
 * (All Cards view), minus looks across all of the user's collections and
 * opens a picker if the copies span multiple collections.
 * @returns Quick-add actions, or undefined handlers when disabled.
 */
export function useQuickAddActions(addTarget?: string, viewCollectionId?: string) {
  const batchedAdd = useBatchedAddCopies();
  const disposeCopies = useDisposeCopies();
  const queryClient = useQueryClient();
  const copiesCollection = getCopiesCollection(queryClient);

  const handleQuickAdd = addTarget
    ? async (printing: Printing) => {
        useAddModeStore.getState().incrementPending(printing);
        try {
          const { result } = batchedAdd.add(printing.id, addTarget);
          const real = await result;
          useAddModeStore.getState().recordAdd(printing, real.id);
        } catch {
          // Error toast is fired by the global mutation onError handler;
          // swallow the rejection here so it doesn't surface as an uncaught
          // promise in the console.
        }
        useAddModeStore.getState().decrementPending(printing.id);
      }
    : undefined;

  const handleUndoAdd = addTarget
    ? async (printing: Printing, anchorEl?: HTMLElement) => {
        // 1. Session undo: if the user just added a copy this session, that's
        //    what "undo" means — remove the most recent one so the action
        //    mirrors the click that created it.
        const entry = useAddModeStore.getState().addedItems.get(printing.id);
        const sessionCopyId = entry?.copyIds.at(-1);
        if (sessionCopyId) {
          useAddModeStore.getState().recordUndo(printing.id);
          try {
            await disposeCopies.mutateAsync({ copyIds: [sessionCopyId] });
          } catch {
            useAddModeStore.getState().recordAdd(printing, sessionCopyId);
          }
          return;
        }

        // 2. Pre-existing copies: decide whether to silently dispose the
        //    newest (single-collection scope) or open the picker (ambiguous).
        const decision = decideRemoval(copiesCollection.toArray, printing.id, viewCollectionId);
        if (decision.kind === "none") {
          return;
        }
        if (decision.kind === "dispose") {
          await disposeCopies.mutateAsync({ copyIds: [decision.copyId] });
          return;
        }

        // 3. Ambiguous (All Cards view, copies across multiple collections):
        //    open the picker anchored to the minus button.
        if (!anchorEl) {
          return;
        }
        const rect = anchorEl.getBoundingClientRect();
        useAddModeStore.getState().openDisposePicker(printing, {
          top: rect.bottom + 4,
          left: Math.max(
            8,
            Math.min(rect.left + rect.width / 2 - 112, globalThis.innerWidth - 232),
          ),
        });
      }
    : undefined;

  const handleDisposeFromCollection = async (printing: Printing, fromCollectionId: string) => {
    const copies = copiesCollection.toArray.filter(
      (c) => c.printingId === printing.id && c.collectionId === fromCollectionId,
    );
    const newest = pickNewestCopy(copies);
    useAddModeStore.getState().closeDisposePicker();
    if (newest) {
      await disposeCopies.mutateAsync({ copyIds: [newest.id] });
    }
  };

  // Track the card whose popover was just closed so the click-through from the
  // mousedown close-outside handler doesn't immediately reopen it.
  const justClosedRef = useRef<string | null>(null);

  const handleOpenVariants = addTarget
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
    handleDisposeFromCollection,
    closeVariants,
    adjustedCount,
  };
}

import type { Printing } from "@openrift/shared";
import { useRef } from "react";
import { toast } from "sonner";

import { useBatchedAddCopies, useDisposeCopies } from "@/hooks/use-copies";
import { decideRemoval, pickNewestCopy } from "@/hooks/use-quick-add-actions-helpers";
import { useCopiesCollection } from "@/lib/copies-collection";
import { summarizeBatchAdd } from "@/lib/summarize-batch-add";
import { isTempCopyId } from "@/lib/temp-copy-id";
import { useAddModeStore } from "@/stores/add-mode-store";
import type { VariantPopoverIntent } from "@/stores/add-mode-store";

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
 * reports "ambiguous" when the copies span multiple collections so the caller
 * can escalate to the variant×collection popover.
 * @returns Quick-add actions, or undefined handlers when disabled.
 */
export function useQuickAddActions(addTarget?: string, viewCollectionId?: string) {
  // Remember printings added this session so onBatchSuccess can look up names
  // for the toast summary without the caller threading them through. Entries
  // are cleared when their batch resolves.
  const pendingPrintingsRef = useRef<Map<string, Printing>>(new Map());
  const batchedAdd = useBatchedAddCopies({
    onBatchSuccess: (printingIds) => {
      const msg = summarizeBatchAdd(
        printingIds,
        (id) => pendingPrintingsRef.current.get(id)?.card.name,
      );
      if (msg) {
        toast.success(msg);
      }
      for (const id of new Set(printingIds)) {
        pendingPrintingsRef.current.delete(id);
      }
    },
    onBatchError: (printingIds) => {
      for (const id of new Set(printingIds)) {
        pendingPrintingsRef.current.delete(id);
      }
    },
  });
  const disposeCopies = useDisposeCopies();
  const copiesCollection = useCopiesCollection();

  // Add one copy of `printing` to a specific collection, with optimistic
  // session tracking for undo. Both the default-target quick-add and the
  // variant×collection popover's per-collection `+` funnel through here.
  const addToCollection = async (printing: Printing, collectionId: string) => {
    pendingPrintingsRef.current.set(printing.id, printing);
    useAddModeStore.getState().incrementPending(printing);
    try {
      const { result } = batchedAdd.add(printing.id, collectionId);
      const real = await result;
      useAddModeStore.getState().recordAdd(printing, real.id);
    } catch {
      // Error toast is fired by the global mutation onError handler;
      // swallow the rejection here so it doesn't surface as an uncaught
      // promise in the console.
    }
    useAddModeStore.getState().decrementPending(printing.id);
  };

  // Default-target quick-add (current collection, or the inbox on All Cards).
  const handleQuickAdd = addTarget
    ? (printing: Printing) => addToCollection(printing, addTarget)
    : undefined;

  // Add to an explicitly chosen collection (the popover's per-collection `+`
  // and its "add to another collection" picker).
  const handleAddToCollection = (printing: Printing, collectionId: string) =>
    addToCollection(printing, collectionId);

  // Silent half of undo-add: session undo + single-collection dispose only.
  // Returns "ambiguous" when copies span multiple collections so the caller
  // can escalate to the variant×collection popover (where the user picks the
  // exact row to remove). Returns "done" when no further action needed.
  const tryUndoAdd = addTarget
    ? async (printing: Printing): Promise<"done" | "ambiguous"> => {
        const entry = useAddModeStore.getState().addedItems.get(printing.id);
        const sessionCopyId = entry?.copyIds.at(-1);
        if (sessionCopyId) {
          useAddModeStore.getState().recordUndo(printing.id);
          try {
            await disposeCopies.mutateAsync({ copyIds: [sessionCopyId] });
          } catch {
            useAddModeStore.getState().recordAdd(printing, sessionCopyId);
          }
          return "done";
        }
        if (!copiesCollection) {
          return "done";
        }
        const decision = decideRemoval(copiesCollection.toArray, printing.id, viewCollectionId);
        if (decision.kind === "none") {
          return "done";
        }
        if (decision.kind === "dispose") {
          await disposeCopies.mutateAsync({ copyIds: [decision.copyId] });
          return "done";
        }
        return "ambiguous";
      }
    : undefined;

  // Remove the newest copy of `printing` from a specific collection. The
  // variant×collection popover's per-collection `-` calls this directly (the
  // collection is already chosen, so no disambiguation is needed).
  const handleDisposeFromCollection = async (printing: Printing, fromCollectionId: string) => {
    if (!copiesCollection) {
      return;
    }
    const copies = copiesCollection.toArray.filter(
      (c) =>
        c.printingId === printing.id && c.collectionId === fromCollectionId && !isTempCopyId(c.id),
    );
    const newest = pickNewestCopy(copies);
    if (newest) {
      await disposeCopies.mutateAsync({ copyIds: [newest.id] });
    }
  };

  // Track the card whose popover was just closed so the click-through from the
  // mousedown close-outside handler doesn't immediately reopen it.
  const justClosedRef = useRef<string | null>(null);

  const handleOpenVariants = addTarget
    ? (
        printing: Printing,
        anchorEl: HTMLElement,
        intent: VariantPopoverIntent,
        scopeToSet = false,
        scopeToPrinting = false,
      ) => {
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
        useAddModeStore
          .getState()
          .openVariants(
            printing.cardId,
            anchorEl,
            intent,
            scopeToSet ? printing.setId : undefined,
            scopeToPrinting ? printing.id : undefined,
          );
      }
    : undefined;

  /**
   * Kept for API compatibility with callers that want a helper; counts now
   * come straight from the copies collection via useOwnedCount, so no
   * adjustment is needed.
   * @returns The owned count as-is.
   */
  const adjustedCount = (_printingId: string, baseCount: number) => baseCount;

  // The same press that closes the popover (mousedown outside the popup) is followed by a click on the anchor that would re-fire handleOpenVariants. Suppress that one click only when the press landed on the popover's own anchor — otherwise reopens after Esc / clicking elsewhere need an extra click.
  const closeVariants = (pressTarget?: EventTarget | null) => {
    const current = useAddModeStore.getState().variantPopover;
    if (current && pressTarget instanceof Node && current.anchorEl.contains(pressTarget)) {
      justClosedRef.current = current.cardId;
    }
    useAddModeStore.getState().closeVariants();
  };

  return {
    handleQuickAdd,
    handleAddToCollection,
    tryUndoAdd,
    handleOpenVariants,
    handleDisposeFromCollection,
    closeVariants,
    adjustedCount,
  };
}

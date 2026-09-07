import { copyHasMetadata } from "@openrift/shared/copy-metadata";
import type { CopyResponse } from "@openrift/shared/types/api/collection";
import type { Printing } from "@openrift/shared/types/catalog";
import { legendDisplayName } from "@openrift/shared/utils";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { useBatchedAddCopies, useDisposeCopies } from "@/hooks/use-copies";
import { decideRemoval, pickRemovalCopy } from "@/hooks/use-quick-add-actions-helpers";
import { useCopiesCollection } from "@/lib/copies-collection";
import { summarizeBatchAdd } from "@/lib/summarize-batch-add";
import { isTempCopyId } from "@/lib/temp-copy-id";
import { useAddModeStore } from "@/stores/add-mode-store";
import type { VariantPopoverIntent } from "@/stores/add-mode-store";
import type { CardRowClickModifiers } from "@/stores/card-row-actions-store";

/**
 * `sessionUndo` marks the session-undo path: add-mode bookkeeping runs only
 * when the dispose actually happens.
 */
export interface PendingAnnotatedDispose {
  copy: CopyResponse;
  printing: Printing;
  sessionUndo?: boolean;
}

/**
 * `viewCollectionId` scopes the minus button when set; undefined (All Cards)
 * looks across all collections and reports "ambiguous" on a multi-collection spread.
 */
export function useQuickAddActions(
  addTarget?: string,
  viewCollectionId?: string,
  onDisposed?: (printing: Printing) => void,
) {
  const pendingPrintingsRef = useRef<Map<string, Printing>>(new Map());
  const batchedAdd = useBatchedAddCopies({
    onBatchSuccess: (printingIds) => {
      const msg = summarizeBatchAdd(printingIds, (id) => {
        const printing = pendingPrintingsRef.current.get(id);
        return printing ? legendDisplayName(printing.card) : undefined;
      });
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

  // A minus press that would destroy recorded details parks here without disposing;
  // the consumer renders AnnotatedDisposeDialog against this state.
  const [pendingAnnotatedDispose, setPendingAnnotatedDispose] =
    useState<PendingAnnotatedDispose | null>(null);

  const confirmAnnotatedDispose = async () => {
    if (!pendingAnnotatedDispose) {
      return;
    }
    const { copy, printing, sessionUndo } = pendingAnnotatedDispose;
    setPendingAnnotatedDispose(null);
    if (sessionUndo) {
      useAddModeStore.getState().recordUndo(printing.id);
    }
    try {
      await disposeCopies.mutateAsync({ copyIds: [copy.id] });
      if (onDisposed) {
        onDisposed(printing);
      }
    } catch {
      // Global onError already toasts; restore the session entry so a later undo still works.
      if (sessionUndo) {
        useAddModeStore.getState().recordAdd(printing, copy.id);
      }
    }
  };

  const cancelAnnotatedDispose = () => setPendingAnnotatedDispose(null);

  const addToCollection = async (printing: Printing, collectionId: string) => {
    pendingPrintingsRef.current.set(printing.id, printing);
    useAddModeStore.getState().incrementPending(printing);
    try {
      const { result } = batchedAdd.add(printing.id, collectionId);
      const real = await result;
      useAddModeStore.getState().recordAdd(printing, real.id);
    } catch {
      // Global onError toasts; swallow so it doesn't surface as an uncaught promise.
    }
    useAddModeStore.getState().decrementPending(printing.id);
  };

  // Adds are issued individually; useBatchedAddCopies coalesces them into one request.
  const handleQuickAdd = addTarget
    ? async (printing: Printing, _modifiers?: CardRowClickModifiers, quantity = 1) => {
        await Promise.all(
          Array.from({ length: Math.max(1, quantity) }, () => addToCollection(printing, addTarget)),
        );
      }
    : undefined;

  const handleAddToCollection = (printing: Printing, collectionId: string) =>
    addToCollection(printing, collectionId);

  // Returns "ambiguous" when copies span multiple collections, so the caller
  // can escalate to the variant×collection popover.
  const tryUndoAdd = addTarget
    ? async (printing: Printing): Promise<"done" | "ambiguous"> => {
        const entry = useAddModeStore.getState().addedItems.get(printing.id);
        const sessionCopyId = entry?.copyIds.at(-1);
        if (sessionCopyId) {
          // Even a copy added this session may have been annotated since;
          // destroying those details still needs a confirmation.
          const sessionCopy = copiesCollection?.toArray.find((c) => c.id === sessionCopyId);
          if (sessionCopy && copyHasMetadata(sessionCopy)) {
            setPendingAnnotatedDispose({ copy: sessionCopy, printing, sessionUndo: true });
            return "done";
          }
          useAddModeStore.getState().recordUndo(printing.id);
          try {
            await disposeCopies.mutateAsync({ copyIds: [sessionCopyId] });
            if (onDisposed) {
              onDisposed(printing);
            }
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
        if (decision.kind === "confirmDispose") {
          const copy = copiesCollection.toArray.find((c) => c.id === decision.copyId);
          if (copy) {
            setPendingAnnotatedDispose({ copy, printing });
          }
          return "done";
        }
        if (decision.kind === "dispose") {
          try {
            await disposeCopies.mutateAsync({ copyIds: [decision.copyId] });
            if (onDisposed) {
              onDisposed(printing);
            }
          } catch {
            // Global onError toasts. Caller (fire-and-forget onDecrement) doesn't catch.
          }
          return "done";
        }
        return "ambiguous";
      }
    : undefined;

  const handleDisposeFromCollection = async (printing: Printing, fromCollectionId: string) => {
    if (!copiesCollection) {
      return;
    }
    const copies = copiesCollection.toArray.filter(
      (c) =>
        c.printingId === printing.id && c.collectionId === fromCollectionId && !isTempCopyId(c.id),
    );
    const candidate = pickRemovalCopy(copies);
    if (!candidate) {
      return;
    }
    if (copyHasMetadata(candidate)) {
      setPendingAnnotatedDispose({ copy: candidate, printing });
      return;
    }
    try {
      await disposeCopies.mutateAsync({ copyIds: [candidate.id] });
      if (onDisposed) {
        onDisposed(printing);
      }
    } catch {
      // Global onError toasts; onRemoveFromCollection is wired straight into
      // this handler and doesn't catch.
    }
  };

  // Closing a pill click-throughs into a reopen call: suppress reopen within a short window of the close.
  const justClosedRef = useRef<{ cardId: string; at: number } | null>(null);
  const REOPEN_SUPPRESS_MS = 350;

  const handleOpenVariants = addTarget
    ? (
        printing: Printing,
        anchorEl: HTMLElement,
        intent: VariantPopoverIntent,
        scopeToSet = false,
        scopeToPrinting = false,
      ) => {
        const jc = justClosedRef.current;
        const recentlyClosed =
          jc?.cardId === printing.cardId && performance.now() - jc.at < REOPEN_SUPPRESS_MS;
        if (recentlyClosed) {
          justClosedRef.current = null;
          return;
        }
        const current = useAddModeStore.getState().variantPopover;
        if (current?.cardId === printing.cardId) {
          justClosedRef.current = { cardId: printing.cardId, at: performance.now() };
          useAddModeStore.getState().closeVariants();
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

  // Kept for API compatibility; counts now come from useOwnedCount directly.
  const adjustedCount = (_printingId: string, baseCount: number) => baseCount;

  // pressTarget is unused; kept so the popover host can pass BaseUI's close
  // details without caring how we suppress reopening.
  const closeVariants = (_pressTarget?: EventTarget | null) => {
    const current = useAddModeStore.getState().variantPopover;
    if (current) {
      justClosedRef.current = { cardId: current.cardId, at: performance.now() };
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
    pendingAnnotatedDispose,
    confirmAnnotatedDispose,
    cancelAnnotatedDispose,
    disposeIsPending: disposeCopies.isPending,
  };
}

import { copyHasMetadata } from "@openrift/shared/copy-metadata";
import type { Printing } from "@openrift/shared/types/catalog";
import { legendDisplayName } from "@openrift/shared/utils";
import { useState } from "react";
import { toast } from "sonner";

import type { CollectionContextAction } from "@/features/cards/stores/card-row-actions-store";
import {
  useCopyListMemberships,
  useDisposeCopies,
  useMoveCopies,
} from "@/features/collections/hooks/use-copies";
import { copyIdsShareOneCard } from "@/features/collections/lib/collection-grid-items";
import { useCopiesCollection } from "@/features/collections/lib/copies-collection";
import type { StackedEntry } from "@/features/collections/lib/stacked-entry";
import { useCollectionOverlayStore } from "@/features/collections/stores/collection-overlay-store";
import type { useWishEntries } from "@/features/groups/hooks/use-wish-entries";

export interface LendTarget {
  printing: Printing;
  maxQuantity: number;
}

interface UseCollectionGridActionsParams {
  stacks: StackedEntry[];
  stackByItemId: Map<string, StackedEntry>;
  stacked: boolean;
  inboxId: string | undefined;
  wish: ReturnType<typeof useWishEntries>;
  clearSelection: () => void;
}

export function useCollectionGridActions({
  stacks,
  stackByItemId,
  stacked,
  inboxId,
  wish,
  clearSelection,
}: UseCollectionGridActionsParams) {
  const [moveOpen, setMoveOpen] = useState(false);
  const [disposeOpen, setDisposeOpen] = useState(false);
  const [addToListOpen, setAddToListOpen] = useState(false);
  const [lendTarget, setLendTarget] = useState<LendTarget | null>(null);
  // Copy IDs the Move / Add-to-list / Dispose dialogs operate on, decoupled
  // from `selected` so a browse-mode right-click can target one card without
  // entering select mode.
  const [actionCopyIds, setActionCopyIds] = useState<string[]>([]);
  const [actionSingleCard, setActionSingleCard] = useState(false);
  const [disposeQuantity, setDisposeQuantity] = useState(0);
  const [actionAnnotatedIds, setActionAnnotatedIds] = useState<ReadonlySet<string>>(new Set());
  const moveCopies = useMoveCopies();
  const disposeCopies = useDisposeCopies();
  const copiesStore = useCopiesCollection();
  const disposeCopyIds = actionCopyIds.slice(0, disposeQuantity);
  const disposeListMemberships = useCopyListMemberships(disposeCopyIds, disposeOpen);
  const disposeAnnotatedCount = disposeCopyIds.filter((copyId) =>
    actionAnnotatedIds.has(copyId),
  ).length;

  const openAction = (action: CollectionContextAction, copyIds: string[]) => {
    setActionCopyIds(copyIds);
    setActionSingleCard(copyIdsShareOneCard(copyIds, stacks));
    if (action === "move") {
      setMoveOpen(true);
    } else if (action === "addToList") {
      setAddToListOpen(true);
    } else {
      const ids = new Set(copyIds);
      setActionAnnotatedIds(
        new Set(
          copiesStore
            ? copiesStore.toArray
                .filter((copy) => ids.has(copy.id) && copyHasMetadata(copy))
                .map((copy) => copy.id)
            : [],
        ),
      );
      setDisposeQuantity(copyIds.length);
      setDisposeOpen(true);
    }
  };

  const handleMove = (toCollectionId: string, quantity: number) => {
    const copyIds = actionCopyIds.slice(0, quantity);
    moveCopies.mutate(
      { copyIds, toCollectionId },
      {
        onSuccess: () => {
          toast.success(`Moved ${copyIds.length} card${copyIds.length > 1 ? "s" : ""}`);
          clearSelection();
          setMoveOpen(false);
        },
      },
    );
  };

  const handleDispose = () => {
    const copyIds = disposeCopyIds;
    disposeCopies.mutate(
      { copyIds },
      {
        onSuccess: () => {
          toast.success(`Removed ${copyIds.length} card${copyIds.length > 1 ? "s" : ""}`);
          clearSelection();
          setDisposeOpen(false);
        },
      },
    );
  };

  // Reuses the move pipeline (member -> inbox); no trade record since a free
  // pile has no reciprocation.
  const handleTake = (itemId: string, count: number) => {
    const stack = stackByItemId.get(itemId);
    if (!stack || !inboxId) {
      return;
    }
    const availableCopyIds = stacked ? stack.copyIds : [itemId];
    if (availableCopyIds.length === 0) {
      return;
    }
    const initialQuantity = Math.min(Math.max(1, count), availableCopyIds.length);
    useCollectionOverlayStore
      .getState()
      .setTakeConfirm({ printing: stack.printing, availableCopyIds, initialQuantity });
  };

  const performTake = (quantity: number) => {
    const takeConfirm = useCollectionOverlayStore.getState().takeConfirm;
    if (!takeConfirm || !inboxId) {
      return;
    }
    const { printing, availableCopyIds } = takeConfirm;
    const copyIds = availableCopyIds.slice(0, Math.max(1, quantity));
    const takenQuantity = copyIds.length;
    moveCopies.mutate(
      { copyIds, toCollectionId: inboxId },
      {
        onSuccess: () => {
          toast.success(
            takenQuantity === 1
              ? `Took ${legendDisplayName(printing.card)}`
              : `Took ${takenQuantity}× ${legendDisplayName(printing.card)}`,
          );
          useCollectionOverlayStore.getState().setTakeConfirm(null);
          const matches = wish.entriesForPrinting(printing.cardId, printing.id);
          if (matches.length > 0) {
            useCollectionOverlayStore
              .getState()
              .setTakeFollowUp({ printing, entries: matches, takenQuantity });
          }
        },
      },
    );
  };

  return {
    moveOpen,
    setMoveOpen,
    disposeOpen,
    setDisposeOpen,
    addToListOpen,
    setAddToListOpen,
    lendTarget,
    setLendTarget,
    actionCopyIds,
    actionSingleCard,
    disposeQuantity,
    setDisposeQuantity,
    disposeListMemberships,
    disposeAnnotatedCount,
    moveIsPending: moveCopies.isPending,
    disposeIsPending: disposeCopies.isPending,
    openAction,
    handleMove,
    handleDispose,
    handleTake,
    performTake,
  };
}

export type CollectionGridActions = ReturnType<typeof useCollectionGridActions>;

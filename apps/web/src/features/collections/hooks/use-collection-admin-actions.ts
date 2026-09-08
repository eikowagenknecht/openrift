import type { CollectionResponse } from "@openrift/shared/types/api/collection";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import {
  useClearCollection,
  useDeleteCollection,
} from "@/features/collections/hooks/use-collections";
import { useCollectionOverlayStore } from "@/features/collections/stores/collection-overlay-store";

export function useCollectionAdminActions(
  collectionId: string | undefined,
  currentCollection: CollectionResponse | undefined,
) {
  const navigate = useNavigate();
  const deleteCollection = useDeleteCollection();
  const clearCollection = useClearCollection();

  const handleDeleteCollection = () => {
    if (!collectionId) {
      return;
    }
    deleteCollection.mutate(collectionId, {
      onSuccess: () => {
        useCollectionOverlayStore.getState().setDeleteOpen(false);
        void navigate({ to: "/collections" });
      },
    });
  };

  const handleClearInbox = () => {
    if (!currentCollection) {
      return;
    }
    clearCollection.mutate(currentCollection.id, {
      onSuccess: ({ removedCount, keptCopyIds }) => {
        useCollectionOverlayStore.getState().setClearInboxOpen(false);
        const keptCount = keptCopyIds.length;
        if (removedCount === 0 && keptCount === 0) {
          toast.info("Your Inbox is already empty");
        } else if (keptCount > 0) {
          toast.success(
            `Removed ${removedCount} card${removedCount === 1 ? "" : "s"}. ${keptCount} stayed because they're reserved in a trade or lent out.`,
          );
        } else {
          toast.success(
            `Removed ${removedCount} card${removedCount === 1 ? "" : "s"} from your Inbox`,
          );
        }
      },
    });
  };

  return {
    handleDeleteCollection,
    deleteIsPending: deleteCollection.isPending,
    handleClearInbox,
    clearInboxIsPending: clearCollection.isPending,
  };
}

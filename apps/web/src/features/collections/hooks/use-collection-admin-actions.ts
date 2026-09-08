import { useNavigate } from "@tanstack/react-router";

import { useDeleteCollection } from "@/features/collections/hooks/use-collections";
import { useCollectionOverlayStore } from "@/features/collections/stores/collection-overlay-store";

export function useCollectionAdminActions(collectionId: string | undefined) {
  const navigate = useNavigate();
  const deleteCollection = useDeleteCollection();

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

  return {
    handleDeleteCollection,
    deleteIsPending: deleteCollection.isPending,
  };
}

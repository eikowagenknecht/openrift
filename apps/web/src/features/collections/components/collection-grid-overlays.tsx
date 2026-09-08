import type { CollectionResponse } from "@openrift/shared/types/api/collection";
import type { Printing } from "@openrift/shared/types/catalog";

import type { PendingAnnotatedDispose } from "@/features/collections/hooks/use-quick-add-actions";
import { useCollectionOverlayStore } from "@/features/collections/stores/collection-overlay-store";
import { useCommandPaletteStore } from "@/stores/command-palette-store";

import { AnnotatedDisposeDialog } from "./annotated-dispose-dialog";
import { ClearInboxDialog } from "./clear-inbox-dialog";
import { CollectionShareDialog } from "./collection-share-dialog";
import { CopyDetailsDialog } from "./copy-details-dialog";
import { DeleteCollectionDialog } from "./delete-collection-dialog";
import { EditCollectionDialog } from "./edit-collection-dialog";
import { QuickAddPalette } from "./quick-add-palette";
import { TakeConfirmDialog } from "./take-confirm-dialog";
import { TakeWishlistFollowUpDialog } from "./take-wishlist-followup-dialog";

interface CollectionGridOverlaysProps {
  addTarget?: string;
  currentCollection?: CollectionResponse;
  catalogAllPrintingsByCardId: Map<string, Printing[]>;
  ownedCountByPrinting?: Record<string, number>;
  preferredLanguages?: readonly string[];
  collections?: CollectionResponse[];
  onDeleteCollection: () => void;
  deleteIsPending: boolean;
  onClearInbox: () => void;
  clearInboxIsPending: boolean;
  pendingAnnotatedDispose: PendingAnnotatedDispose | null;
  confirmAnnotatedDispose: () => Promise<void>;
  cancelAnnotatedDispose: () => void;
  disposeIsPending: boolean;
  performTake: (quantity: number) => void;
  moveIsPending: boolean;
}

/**
 * Must render as a sibling of the empty/populated branch, not inside either
 * arm, or an open QuickAddPalette remounts and loses state on the first add.
 */
export function CollectionGridOverlays({
  addTarget,
  currentCollection,
  catalogAllPrintingsByCardId,
  ownedCountByPrinting,
  preferredLanguages,
  collections,
  onDeleteCollection: handleDeleteCollection,
  deleteIsPending,
  onClearInbox: handleClearInbox,
  clearInboxIsPending,
  pendingAnnotatedDispose,
  confirmAnnotatedDispose,
  cancelAnnotatedDispose,
  disposeIsPending,
  performTake,
  moveIsPending,
}: CollectionGridOverlaysProps) {
  const quickAddOpen = useCommandPaletteStore((state) => state.quickAddOpen);
  const deleteOpen = useCollectionOverlayStore((state) => state.deleteOpen);
  const clearInboxOpen = useCollectionOverlayStore((state) => state.clearInboxOpen);
  const editOpen = useCollectionOverlayStore((state) => state.editOpen);
  const shareOpen = useCollectionOverlayStore((state) => state.shareOpen);
  const copyDetailsTarget = useCollectionOverlayStore((state) => state.copyDetailsTarget);
  const takeConfirm = useCollectionOverlayStore((state) => state.takeConfirm);
  const takeFollowUp = useCollectionOverlayStore((state) => state.takeFollowUp);

  const setQuickAddOpen = useCommandPaletteStore((state) => state.setQuickAddOpen);
  const setDeleteOpen = useCollectionOverlayStore((state) => state.setDeleteOpen);
  const setClearInboxOpen = useCollectionOverlayStore((state) => state.setClearInboxOpen);
  const setEditOpen = useCollectionOverlayStore((state) => state.setEditOpen);
  const setShareOpen = useCollectionOverlayStore((state) => state.setShareOpen);
  const setCopyDetailsTarget = useCollectionOverlayStore((state) => state.setCopyDetailsTarget);
  const setTakeConfirm = useCollectionOverlayStore((state) => state.setTakeConfirm);
  const setTakeFollowUp = useCollectionOverlayStore((state) => state.setTakeFollowUp);

  return (
    <>
      {addTarget && (
        <QuickAddPalette
          open={quickAddOpen}
          onOpenChange={setQuickAddOpen}
          collectionId={addTarget}
          collectionName={currentCollection?.name ?? "Collection"}
          printingsByCardId={catalogAllPrintingsByCardId}
          ownedCountByPrinting={ownedCountByPrinting}
          preferredLanguages={preferredLanguages}
          collections={collections}
        />
      )}
      {currentCollection && !currentCollection.isInbox && (
        <DeleteCollectionDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          collectionName={currentCollection.name}
          copyCount={currentCollection.copyCount}
          onConfirm={handleDeleteCollection}
          isPending={deleteIsPending}
        />
      )}
      {currentCollection?.isInbox && (
        <ClearInboxDialog
          open={clearInboxOpen}
          onOpenChange={setClearInboxOpen}
          copyCount={currentCollection.copyCount}
          onConfirm={handleClearInbox}
          isPending={clearInboxIsPending}
        />
      )}
      {currentCollection && (
        <EditCollectionDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          collectionId={currentCollection.id}
          currentName={currentCollection.name}
          isInbox={currentCollection.isInbox}
        />
      )}
      {currentCollection && (
        <CollectionShareDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          collectionId={currentCollection.id}
          collectionName={currentCollection.name}
          isPublic={currentCollection.isPublic}
          shareToken={currentCollection.shareToken}
          isGroupCollection={currentCollection.groupId !== null}
        />
      )}
      <AnnotatedDisposeDialog
        pending={pendingAnnotatedDispose}
        onConfirm={() => void confirmAnnotatedDispose()}
        onCancel={cancelAnnotatedDispose}
        isPending={disposeIsPending}
      />
      <CopyDetailsDialog
        target={copyDetailsTarget}
        onOpenChange={(open) => {
          if (!open) {
            setCopyDetailsTarget(null);
          }
        }}
      />
      <TakeConfirmDialog
        printing={takeConfirm?.printing ?? null}
        maxQuantity={takeConfirm?.availableCopyIds.length ?? 1}
        initialQuantity={takeConfirm?.initialQuantity ?? 1}
        isPending={moveIsPending}
        onConfirm={performTake}
        onOpenChange={(open) => {
          if (!open) {
            setTakeConfirm(null);
          }
        }}
      />
      <TakeWishlistFollowUpDialog
        printing={takeFollowUp?.printing ?? null}
        entries={takeFollowUp?.entries ?? []}
        takenQuantity={takeFollowUp?.takenQuantity ?? 1}
        onOpenChange={(open) => {
          if (!open) {
            setTakeFollowUp(null);
          }
        }}
      />
    </>
  );
}

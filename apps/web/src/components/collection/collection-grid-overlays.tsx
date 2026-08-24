import type { CollectionResponse, Printing } from "@openrift/shared";

import type { PendingAnnotatedDispose } from "@/hooks/use-quick-add-actions";
import { useCollectionOverlayStore } from "@/stores/collection-overlay-store";

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
  handleDeleteCollection: () => void;
  deleteIsPending: boolean;
  handleClearInbox: () => void;
  clearInboxIsPending: boolean;
  pendingAnnotatedDispose: PendingAnnotatedDispose | null;
  confirmAnnotatedDispose: () => Promise<void>;
  cancelAnnotatedDispose: () => void;
  disposeIsPending: boolean;
  performTake: (quantity: number) => void;
  moveIsPending: boolean;
}

/**
 * Every dialog mounted once below the collection grid (quick add, delete,
 * clear inbox, edit, share, annotated dispose, copy details, take confirm,
 * take follow-up). Rendered as the trailing sibling of the empty/populated
 * content branch rather than inside either arm, so these overlays keep a
 * single, stable mount point across the empty <-> populated transition (an
 * open QuickAddPalette keeps its state across the first add instead of
 * remounting when the empty-state subtree unmounts).
 *
 * Which overlay is open comes from the collection overlay store, not from
 * props: the grid dispatches into that store without subscribing to it, so
 * opening a dialog doesn't re-render the virtualized grid behind it. What stays
 * as props is what only the grid can supply — the catalog maps, the mutation
 * handlers and their pending flags.
 * @returns The overlay dialogs for the collection grid.
 */
export function CollectionGridOverlays({
  addTarget,
  currentCollection,
  catalogAllPrintingsByCardId,
  ownedCountByPrinting,
  preferredLanguages,
  collections,
  handleDeleteCollection,
  deleteIsPending,
  handleClearInbox,
  clearInboxIsPending,
  pendingAnnotatedDispose,
  confirmAnnotatedDispose,
  cancelAnnotatedDispose,
  disposeIsPending,
  performTake,
  moveIsPending,
}: CollectionGridOverlaysProps) {
  const quickAddOpen = useCollectionOverlayStore((state) => state.quickAddOpen);
  const deleteOpen = useCollectionOverlayStore((state) => state.deleteOpen);
  const clearInboxOpen = useCollectionOverlayStore((state) => state.clearInboxOpen);
  const editOpen = useCollectionOverlayStore((state) => state.editOpen);
  const shareOpen = useCollectionOverlayStore((state) => state.shareOpen);
  const copyDetailsTarget = useCollectionOverlayStore((state) => state.copyDetailsTarget);
  const takeConfirm = useCollectionOverlayStore((state) => state.takeConfirm);
  const takeFollowUp = useCollectionOverlayStore((state) => state.takeFollowUp);

  const setQuickAddOpen = useCollectionOverlayStore((state) => state.setQuickAddOpen);
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

import type { CollectionResponse, Printing } from "@openrift/shared";

import type { PendingAnnotatedDispose } from "@/hooks/use-quick-add-actions";
import type { WishEntryFlat } from "@/hooks/use-wish-entries";

import { AnnotatedDisposeDialog } from "./annotated-dispose-dialog";
import { ClearInboxDialog } from "./clear-inbox-dialog";
import { CollectionShareDialog } from "./collection-share-dialog";
import type { CopyDetailsTarget } from "./copy-details-dialog";
import { CopyDetailsDialog } from "./copy-details-dialog";
import { DeleteCollectionDialog } from "./delete-collection-dialog";
import { EditCollectionDialog } from "./edit-collection-dialog";
import { QuickAddPalette } from "./quick-add-palette";
import { TakeConfirmDialog } from "./take-confirm-dialog";
import { TakeWishlistFollowUpDialog } from "./take-wishlist-followup-dialog";

interface CollectionGridOverlaysProps {
  addTarget?: string;
  quickAddOpen: boolean;
  setQuickAddOpen: (open: boolean) => void;
  currentCollection?: CollectionResponse;
  catalogAllPrintingsByCardId: Map<string, Printing[]>;
  ownedCountByPrinting?: Record<string, number>;
  preferredLanguages?: readonly string[];
  collections?: CollectionResponse[];
  deleteOpen: boolean;
  setDeleteOpen: (open: boolean) => void;
  handleDeleteCollection: () => void;
  deleteIsPending: boolean;
  clearInboxOpen: boolean;
  setClearInboxOpen: (open: boolean) => void;
  handleClearInbox: () => void;
  clearInboxIsPending: boolean;
  editOpen: boolean;
  setEditOpen: (open: boolean) => void;
  shareOpen: boolean;
  setShareOpen: (open: boolean) => void;
  pendingAnnotatedDispose: PendingAnnotatedDispose | null;
  confirmAnnotatedDispose: () => Promise<void>;
  cancelAnnotatedDispose: () => void;
  disposeIsPending: boolean;
  copyDetailsTarget: CopyDetailsTarget | null;
  setCopyDetailsTarget: (target: CopyDetailsTarget | null) => void;
  takeConfirm: {
    printing: Printing;
    availableCopyIds: string[];
    initialQuantity: number;
  } | null;
  setTakeConfirm: (
    value: { printing: Printing; availableCopyIds: string[]; initialQuantity: number } | null,
  ) => void;
  performTake: (quantity: number) => void;
  moveIsPending: boolean;
  takeFollowUp: {
    printing: Printing;
    entries: WishEntryFlat[];
    takenQuantity: number;
  } | null;
  setTakeFollowUp: (
    value: { printing: Printing; entries: WishEntryFlat[]; takenQuantity: number } | null,
  ) => void;
  inboxName?: string;
}

/**
 * Every dialog mounted once below the collection grid (quick add, delete,
 * clear inbox, edit, share, annotated dispose, copy details, take confirm,
 * take follow-up). Rendered as the trailing sibling of the empty/populated
 * content branch rather than inside either arm, so these overlays keep a
 * single, stable mount point across the empty <-> populated transition (an
 * open QuickAddPalette keeps its state across the first add instead of
 * remounting when the empty-state subtree unmounts).
 * @returns The overlay dialogs for the collection grid.
 */
export function CollectionGridOverlays({
  addTarget,
  quickAddOpen,
  setQuickAddOpen,
  currentCollection,
  catalogAllPrintingsByCardId,
  ownedCountByPrinting,
  preferredLanguages,
  collections,
  deleteOpen,
  setDeleteOpen,
  handleDeleteCollection,
  deleteIsPending,
  clearInboxOpen,
  setClearInboxOpen,
  handleClearInbox,
  clearInboxIsPending,
  editOpen,
  setEditOpen,
  shareOpen,
  setShareOpen,
  pendingAnnotatedDispose,
  confirmAnnotatedDispose,
  cancelAnnotatedDispose,
  disposeIsPending,
  copyDetailsTarget,
  setCopyDetailsTarget,
  takeConfirm,
  setTakeConfirm,
  performTake,
  moveIsPending,
  takeFollowUp,
  setTakeFollowUp,
  inboxName,
}: CollectionGridOverlaysProps) {
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
        inboxName={inboxName ?? "Inbox"}
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

import { imageUrl } from "@openrift/shared/image-url";
import type { DeckDetailResponse } from "@openrift/shared/types/api/deck";
import type { Marketplace } from "@openrift/shared/types/pricing";
import { useNavigate } from "@tanstack/react-router";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DialogForm } from "@/components/ui/dialog-form";
import { usePreferredPrinting } from "@/features/cards/hooks/use-preferred-printing";
import { DeckCoverDialog } from "@/features/decks/components/deck-cover-dialog";
import { DeckDetailsDialog } from "@/features/decks/components/deck-details-dialog";
import { DeckExportDialog } from "@/features/decks/components/deck-export-dialog";
import { DeckHomeCollectionDialog } from "@/features/decks/components/deck-home-collection-dialog";
import { DeckMissingCardsDialog } from "@/features/decks/components/deck-missing-cards-dialog";
import { DeckPrintDialog } from "@/features/decks/components/deck-print-dialog";
import { DeckQuickAdd } from "@/features/decks/components/deck-quick-add";
import { DeckRenameDialog } from "@/features/decks/components/deck-rename-dialog";
import { DeckShareDialog } from "@/features/decks/components/deck-share-dialog";
import { DeckVariantCreateDialog } from "@/features/decks/components/deck-variant-create-dialog";
import { DeckVariantsDialog } from "@/features/decks/components/deck-variants-dialog";
import type { DeckEditorDialogState } from "@/features/decks/hooks/use-deck-editor-dialogs";
import { useDeleteDeck } from "@/features/decks/hooks/use-decks";
import type { DeckBuilderCard } from "@/features/decks/lib/deck-builder-card";
import type { DeckOwnershipData } from "@/features/decks/lib/deck-ownership-types";
import { useLocalDecksStore } from "@/features/decks/stores/local-decks-store";
import { useCommandPaletteStore } from "@/stores/command-palette-store";

interface DeckEditorDialogsProps {
  deckId: string;
  deck: DeckDetailResponse["deck"];
  cards: DeckBuilderCard[];
  isLocal: boolean;
  isDirty: boolean;
  ownershipData: DeckOwnershipData | undefined;
  marketplace: Marketplace;
  dialogs: DeckEditorDialogState;
}

export function DeckEditorDialogs({
  deckId,
  deck,
  cards,
  isLocal,
  isDirty,
  ownershipData,
  marketplace,
  dialogs,
}: DeckEditorDialogsProps) {
  const navigate = useNavigate();
  const deleteDeck = useDeleteDeck();
  const deleteLocalDeck = useLocalDecksStore((state) => state.deleteDeck);
  const { getPreferredFrontImage } = usePreferredPrinting();
  const quickAddOpen = useCommandPaletteStore((state) => state.quickAddOpen);
  const setQuickAddOpen = useCommandPaletteStore((state) => state.setQuickAddOpen);
  const { open, setDialogOpen } = dialogs;

  const handleDelete = () => {
    setDialogOpen("delete", false);
    // A local deck lives only in the store, so it never reaches the server
    // mutation. Both paths land back on the list.
    if (isLocal) {
      deleteLocalDeck(deckId);
      void navigate({ to: "/decks" });
      return;
    }
    // Guard against double-submission: a second confirm while the first delete
    // is still in flight would 404 on the server.
    if (deleteDeck.isPending) {
      return;
    }
    deleteDeck.mutate(deckId, {
      onSuccess: () => {
        void navigate({ to: "/decks" });
      },
      // Errors are reported by the global mutation error toast.
    });
  };

  return (
    <>
      {isLocal && (
        <DeckRenameDialog
          deckId={deckId}
          currentName={deck.name}
          open={open.rename}
          onOpenChange={(next) => setDialogOpen("rename", next)}
        />
      )}
      {!isLocal && (
        <DeckDetailsDialog
          deckId={deckId}
          currentName={deck.name}
          currentDescription={deck.description ?? null}
          currentLinks={deck.links}
          open={open.details}
          onOpenChange={(next) => setDialogOpen("details", next)}
        />
      )}
      {!isLocal && (
        <DeckHomeCollectionDialog
          deckId={deckId}
          currentCollectionId={deck.collectionId}
          open={open.homeCollection}
          onOpenChange={(next) => setDialogOpen("homeCollection", next)}
        />
      )}
      {!isLocal && (
        <DeckVariantCreateDialog
          deckId={deckId}
          deckName={deck.name}
          open={open.variantCreate}
          onOpenChange={(next) => setDialogOpen("variantCreate", next)}
        />
      )}
      {!isLocal && (
        <DeckVariantsDialog
          deckId={deckId}
          deckName={deck.name}
          open={open.variants}
          onOpenChange={(next) => setDialogOpen("variants", next)}
        />
      )}

      <AlertDialog open={open.delete} onOpenChange={(next) => setDialogOpen("delete", next)}>
        <AlertDialogContent>
          <DialogForm onSubmit={handleDelete}>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete deck</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete &ldquo;{deck.name}&rdquo;?{" "}
                {isLocal
                  ? "It only exists on this device, so this cannot be undone."
                  : "This cannot be undone."}
                {deck.familyId !== null && " The other versions of it stay."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction type="submit" disabled={deleteDeck.isPending}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </DialogForm>
        </AlertDialogContent>
      </AlertDialog>
      <DeckShareDialog
        deckId={deckId}
        deckName={deck.name}
        isPublic={deck.isPublic}
        shareToken={deck.shareToken}
        isDirty={isDirty}
        open={open.share}
        onOpenChange={(next) => setDialogOpen("share", next)}
      />
      <DeckExportDialog
        deckId={deckId}
        isDirty={isDirty}
        open={open.export}
        onOpenChange={(next) => setDialogOpen("export", next)}
      />
      <DeckPrintDialog
        open={open.print}
        onOpenChange={(next) => setDialogOpen("print", next)}
        deckId={deckId}
        deckName={deck.name}
      />
      {ownershipData && (
        <DeckMissingCardsDialog
          open={open.missing}
          onOpenChange={(next) => setDialogOpen("missing", next)}
          missingCards={ownershipData.missingCards}
          totalMissingValue={ownershipData.missingValueCents}
          marketplace={marketplace}
          deckName={deck.name}
        />
      )}
      <DeckQuickAdd
        open={quickAddOpen}
        onOpenChange={setQuickAddOpen}
        deckId={deckId}
        format={deck.format}
        cards={cards}
      />
      <DeckCoverDialog
        open={open.cover}
        onOpenChange={(next) => setDialogOpen("cover", next)}
        deckId={deckId}
        cards={cards}
        coverCardId={deck.coverCardId}
        coverPrintingId={deck.coverPrintingId}
        coverPosition={deck.coverPosition}
        getThumbnail={(cardId, preferredPrintingId) => {
          const id = getPreferredFrontImage(cardId, preferredPrintingId)?.imageId;
          return id ? imageUrl(id, "400w") : undefined;
        }}
      />
    </>
  );
}

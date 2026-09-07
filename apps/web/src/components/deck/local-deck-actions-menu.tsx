import type { DeckListItemResponse } from "@openrift/shared/types/api/deck";
import {
  CopyIcon,
  DownloadIcon,
  EllipsisVerticalIcon,
  PencilIcon,
  PrinterIcon,
  Share2Icon,
  Trash2Icon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

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
import { Button } from "@/components/ui/button";
import { DialogForm } from "@/components/ui/dialog-form";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCards } from "@/hooks/use-cards";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { toDeckBuilderCard } from "@/lib/deck-builder-card";
import { useLocalDecksStore } from "@/stores/local-decks-store";

import { DeckExportDialog } from "./deck-export-dialog";
import { DeckPrintDialog } from "./deck-print-dialog";
import { DeckRenameDialog } from "./deck-rename-dialog";
import { DeckShareDialog } from "./deck-share-dialog";

/**
 * Actions for a browser-local deck: share, export, print, rename, duplicate,
 * delete, all client-side via the local store, no account mutations.
 */
export function LocalDeckActionsMenu({ item }: { item: DeckListItemResponse }) {
  const { deck } = item;
  const localDeck = useLocalDecksStore((state) => state.decks[deck.id]);
  const duplicateDeck = useLocalDecksStore((state) => state.duplicateDeck);
  const deleteDeck = useLocalDecksStore((state) => state.deleteDeck);
  const { cardsById } = useCards();

  const [renameOpen, setRenameOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const cards: DeckBuilderCard[] = localDeck
    ? localDeck.cards
        .map((card) => toDeckBuilderCard(card, cardsById))
        .filter((card): card is DeckBuilderCard => card !== null)
    : [];

  const handleDuplicate = () => {
    const newId = duplicateDeck(deck.id);
    if (newId) {
      toast.success(`Duplicated "${deck.name}".`);
    }
  };

  const handleDelete = () => {
    deleteDeck(deck.id);
    setDeleteOpen(false);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon-sm" aria-label="Deck actions" />}
        >
          <EllipsisVerticalIcon className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() => {
              setShareOpen(true);
            }}
          >
            <Share2Icon className="size-4" />
            Share…
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              setExportOpen(true);
            }}
          >
            <DownloadIcon className="size-4" />
            Export…
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              setPrintOpen(true);
            }}
          >
            <PrinterIcon className="size-4" />
            Print…
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              setRenameOpen(true);
            }}
          >
            <PencilIcon className="size-4" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleDuplicate}>
            <CopyIcon className="size-4" />
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              setDeleteOpen(true);
            }}
            className="text-destructive focus:text-destructive"
          >
            <Trash2Icon className="size-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DeckRenameDialog
        deckId={deck.id}
        currentName={deck.name}
        open={renameOpen}
        onOpenChange={setRenameOpen}
      />

      <DeckShareDialog
        deckId={deck.id}
        deckName={deck.name}
        open={shareOpen}
        onOpenChange={setShareOpen}
        cards={cards}
      />

      <DeckExportDialog
        deckId={deck.id}
        isDirty={false}
        open={exportOpen}
        onOpenChange={setExportOpen}
        cards={cards}
      />

      <DeckPrintDialog
        open={printOpen}
        onOpenChange={setPrintOpen}
        cards={cards}
        deckId={deck.id}
        deckName={deck.name}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <DialogForm onSubmit={handleDelete}>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete deck</AlertDialogTitle>
              <AlertDialogDescription>
                Delete &ldquo;{deck.name}&rdquo;? It only exists on this device, so this cannot be
                undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction type="submit">Delete</AlertDialogAction>
            </AlertDialogFooter>
          </DialogForm>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

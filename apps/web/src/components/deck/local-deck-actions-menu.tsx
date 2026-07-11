import type { DeckListItemResponse } from "@openrift/shared";
import {
  CopyIcon,
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
import { DeckRenameDialog } from "./deck-rename-dialog";
import { ProxyExportDialog } from "./proxy-export-dialog";

/**
 * Actions menu for a browser-local deck (ADR-035): rename, duplicate, share
 * (deck code), export, proxies, and delete — all client-side via the local
 * store, with no account mutations. The server {@link DeckActionsMenu} (pin /
 * archive / clone / server share) doesn't apply to a local deck.
 *
 * @returns The local-deck actions menu element.
 */
export function LocalDeckActionsMenu({ item }: { item: DeckListItemResponse }) {
  const { deck } = item;
  const localDeck = useLocalDecksStore((state) => state.decks[deck.id]);
  const duplicateDeck = useLocalDecksStore((state) => state.duplicateDeck);
  const deleteDeck = useLocalDecksStore((state) => state.deleteDeck);
  const { cardsById } = useCards();

  const [renameOpen, setRenameOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [proxyOpen, setProxyOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const cards: DeckBuilderCard[] = localDeck
    ? localDeck.cards
        .map((card) => toDeckBuilderCard(card, cardsById))
        .filter((card): card is DeckBuilderCard => card !== null)
    : [];

  const stop = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleDuplicate = (event: React.MouseEvent) => {
    stop(event);
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
          onClick={stop}
        >
          <EllipsisVerticalIcon className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={(event: React.MouseEvent) => {
              stop(event);
              setExportOpen(true);
            }}
          >
            <Share2Icon className="size-4" />
            Export
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={(event: React.MouseEvent) => {
              stop(event);
              setProxyOpen(true);
            }}
          >
            <PrinterIcon className="size-4" />
            Proxies
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={(event: React.MouseEvent) => {
              stop(event);
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
            onClick={(event: React.MouseEvent) => {
              stop(event);
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

      <DeckExportDialog
        deckId={deck.id}
        deckName={deck.name}
        isDirty={false}
        open={exportOpen}
        onOpenChange={setExportOpen}
        cards={cards}
      />

      <ProxyExportDialog
        open={proxyOpen}
        onOpenChange={setProxyOpen}
        cards={cards}
        deckName={deck.name}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <DialogForm onSubmit={handleDelete}>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete deck</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete &ldquo;{deck.name}&rdquo;? It only exists on this
                device, so this cannot be undone.
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

import type { DeckFormat, DeckListItemResponse, DeckResponse } from "@openrift/shared";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  CopyIcon,
  EllipsisVerticalIcon,
  PencilIcon,
  PinIcon,
  PinOffIcon,
  PrinterIcon,
  RefreshCwIcon,
  Share2Icon,
  Trash2Icon,
} from "lucide-react";
import { useState } from "react";

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
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useCards } from "@/hooks/use-cards";
import {
  deckDetailQueryOptions,
  useCloneDeck,
  useDeleteDeck,
  useSetDeckArchived,
  useSetDeckPinned,
  useUpdateDeck,
} from "@/hooks/use-decks";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { toDeckBuilderCard } from "@/lib/deck-builder-card";

import { DeckExportDialog } from "./deck-export-dialog";
import { ProxyExportDialog } from "./proxy-export-dialog";

/**
 * Dropdown menu with deck actions (export, proxies, rename, format toggle, clone, delete).
 * Owns its dialogs and mutations so both tile and list-row layouts can drop it in.
 * @returns The actions menu element.
 */
export function DeckActionsMenu({ item }: { item: DeckListItemResponse }) {
  const { deck } = item;
  const navigate = useNavigate();
  const cloneDeck = useCloneDeck();
  const updateDeck = useUpdateDeck();
  const deleteDeck = useDeleteDeck();
  const setPinned = useSetDeckPinned();
  const setArchived = useSetDeckArchived();

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [proxyOpen, setProxyOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameName, setRenameName] = useState(deck.name);

  // Lazy-fetch full card detail only when export/proxy dialogs are open
  const needsDetail = exportOpen || proxyOpen;
  const { data: detail } = useQuery({
    ...deckDetailQueryOptions(deck.id),
    enabled: needsDetail,
  });
  const { cardsById } = useCards();
  const detailCards = detail
    ? detail.cards
        .map((card) => toDeckBuilderCard(card, cardsById))
        .filter((card): card is DeckBuilderCard => card !== null)
    : undefined;

  const stop = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleClone = (event: React.MouseEvent) => {
    stop(event);
    cloneDeck.mutate(deck.id, {
      onSuccess: (data) => {
        const newDeck = data as DeckResponse;
        void navigate({ to: "/decks/$deckId", params: { deckId: newDeck.id } });
      },
    });
  };

  const handleDelete = () => {
    deleteDeck.mutate(deck.id);
    setDeleteOpen(false);
  };

  const handleRename = () => {
    const trimmed = renameName.trim();
    if (trimmed && trimmed !== deck.name) {
      updateDeck.mutate({ deckId: deck.id, name: trimmed });
    }
    setRenameOpen(false);
  };

  const handleFormatToggle = (event: React.MouseEvent) => {
    stop(event);
    const newFormat: DeckFormat = deck.format === "constructed" ? "freeform" : "constructed";
    updateDeck.mutate({ deckId: deck.id, format: newFormat });
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
              setPinned.mutate({ deckId: deck.id, isPinned: !deck.isPinned });
            }}
          >
            {deck.isPinned ? (
              <>
                <PinOffIcon className="size-4" />
                Unpin
              </>
            ) : (
              <>
                <PinIcon className="size-4" />
                Pin
              </>
            )}
          </DropdownMenuItem>
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
              setRenameName(deck.name);
              setRenameOpen(true);
            }}
          >
            <PencilIcon className="size-4" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleFormatToggle}>
            <RefreshCwIcon className="size-4" />
            {deck.format === "constructed" ? "Change to freeform" : "Change to constructed"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleClone}>
            <CopyIcon className="size-4" />
            Clone
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={(event: React.MouseEvent) => {
              stop(event);
              setArchived.mutate({ deckId: deck.id, archived: deck.archivedAt === null });
            }}
          >
            {deck.archivedAt === null ? (
              <>
                <ArchiveIcon className="size-4" />
                Archive
              </>
            ) : (
              <>
                <ArchiveRestoreIcon className="size-4" />
                Unarchive
              </>
            )}
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

      <DeckExportDialog
        deckId={deck.id}
        deckName={deck.name}
        isDirty={false}
        open={exportOpen}
        onOpenChange={setExportOpen}
        cards={detailCards}
      />

      <ProxyExportDialog
        open={proxyOpen}
        onOpenChange={setProxyOpen}
        cards={detailCards}
        deckName={deck.name}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete deck</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{deck.name}&rdquo;? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={renameOpen}
        onOpenChange={(open) => {
          setRenameOpen(open);
          if (!open) {
            setRenameName(deck.name);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename deck</DialogTitle>
            <DialogDescription>Enter a new name for your deck.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              handleRename();
            }}
          >
            <Input
              ref={(node) => {
                node?.focus();
              }}
              value={renameName}
              onChange={(event) => setRenameName(event.target.value)}
              maxLength={100}
            />
            <DialogFooter className="mt-4">
              <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
              <Button type="submit" disabled={!renameName.trim()}>
                Rename
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

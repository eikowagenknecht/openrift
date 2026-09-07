import type { DeckListItemResponse } from "@openrift/shared/types/api/deck";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  DownloadIcon,
  EllipsisVerticalIcon,
  FlaskConicalIcon,
  FolderIcon,
  GitBranchIcon,
  MonitorPlayIcon,
  PencilIcon,
  PinIcon,
  PinOffIcon,
  PrinterIcon,
  RefreshCwIcon,
  SettingsIcon,
  Share2Icon,
  StarIcon,
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
import { DialogForm } from "@/components/ui/dialog-form";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCards } from "@/hooks/use-cards";
import { useDeckFolders, useSetDeckFolders } from "@/hooks/use-deck-folders";
import {
  deckDetailQueryOptions,
  useDeleteDeck,
  usePromoteDeckPrimary,
  useSetDeckArchived,
  useSetDeckPinned,
  useUpdateDeck,
} from "@/hooks/use-decks";
import { useDeckFormatList } from "@/hooks/use-enums";
import { useRequiredUserId } from "@/lib/auth-session";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { toDeckBuilderCard } from "@/lib/deck-builder-card";

import { DeckExportDialog } from "./deck-export-dialog";
import { DeckPrintDialog } from "./deck-print-dialog";
import { DeckRenameDialog } from "./deck-rename-dialog";
import { DeckShareDialog } from "./deck-share-dialog";
import { DeckVariantsDialog } from "./deck-variants-dialog";
import { ManageDeckFoldersDialog } from "./manage-deck-folders-dialog";

export function DeckActionsMenu({ item }: { item: DeckListItemResponse }) {
  const userId = useRequiredUserId();
  const { deck } = item;
  const navigate = useNavigate();
  const updateDeck = useUpdateDeck();
  const deleteDeck = useDeleteDeck();
  const setPinned = useSetDeckPinned();
  const setArchived = useSetDeckArchived();
  const promotePrimary = usePromoteDeckPrimary();
  const { formats } = useDeckFormatList();
  const otherFormats = formats.filter((entry) => entry.slug !== deck.format);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [foldersOpen, setFoldersOpen] = useState(false);
  const [variantsOpen, setVariantsOpen] = useState(false);

  const { data: folders } = useDeckFolders();
  const setDeckFolders = useSetDeckFolders();
  const folderList = folders ?? [];

  // Fetched lazily: only while share/export/print need it.
  const needsDetail = shareOpen || exportOpen || printOpen;
  const { data: detail } = useQuery({
    ...deckDetailQueryOptions(userId, deck.id),
    enabled: needsDetail,
  });
  const { cardsById } = useCards();
  const detailCards = detail
    ? detail.cards
        .map((card) => toDeckBuilderCard(card, cardsById))
        .filter((card): card is DeckBuilderCard => card !== null)
    : undefined;

  const handleDelete = () => {
    // A second confirm while the delete is in flight 404s on the server.
    if (deleteDeck.isPending) {
      return;
    }
    deleteDeck.mutate(deck.id);
    setDeleteOpen(false);
  };

  const handleFormatChange = (slug: string) => {
    updateDeck.mutate({ deckId: deck.id, format: slug });
  };

  // Folder membership is set wholesale; the toggle sends the full resulting set.
  const handleToggleFolder = (folderId: string) => {
    const next = item.folderIds.includes(folderId)
      ? item.folderIds.filter((id) => id !== folderId)
      : [...item.folderIds, folderId];
    setDeckFolders.mutate({ id: deck.id, folderIds: next });
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
          {item.totalCards > 0 && (
            <DropdownMenuItem
              onClick={() => {
                void navigate({ to: "/stage", search: { deck: deck.id, i: 0 } });
              }}
            >
              <MonitorPlayIcon className="size-4" />
              Present
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={() => {
              setRenameOpen(true);
            }}
          >
            <PencilIcon className="size-4" />
            Rename
          </DropdownMenuItem>
          {otherFormats.length > 0 && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <RefreshCwIcon className="size-4" />
                Change format
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {otherFormats.map((entry) => (
                  <DropdownMenuItem key={entry.slug} onClick={() => handleFormatChange(entry.slug)}>
                    {entry.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
          {/* A deck can sit in several folders; toggling one doesn't remove others. */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <FolderIcon className="size-4" />
              Add to folder
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {folderList.map((folder) => (
                <DropdownMenuCheckboxItem
                  key={folder.id}
                  checked={item.folderIds.includes(folder.id)}
                  onClick={() => {
                    handleToggleFolder(folder.id);
                  }}
                >
                  {folder.name}
                </DropdownMenuCheckboxItem>
              ))}
              {folderList.length > 0 && <DropdownMenuSeparator />}
              <DropdownMenuItem
                onClick={() => {
                  setFoldersOpen(true);
                }}
              >
                <SettingsIcon className="size-4" />
                Manage folders…
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          {/* Also where a standalone deck gets linked to its first sibling. */}
          <DropdownMenuItem
            onClick={() => {
              setVariantsOpen(true);
            }}
          >
            <GitBranchIcon className="size-4" />
            Variants…
          </DropdownMenuItem>
          {deck.familyId !== null && !deck.isPrimary && (
            <DropdownMenuItem
              onClick={() => {
                promotePrimary.mutate(deck.id);
              }}
            >
              <StarIcon className="size-4" />
              Make primary
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={() => {
              updateDeck.mutate({ deckId: deck.id, isDraft: !deck.isDraft });
            }}
          >
            <FlaskConicalIcon className="size-4" />
            {deck.isDraft ? "Remove draft mark" : "Mark as draft"}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
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

      <DeckShareDialog
        deckId={deck.id}
        deckName={deck.name}
        isPublic={detail?.deck.isPublic ?? false}
        shareToken={detail?.deck.shareToken ?? null}
        open={shareOpen}
        onOpenChange={setShareOpen}
        cards={detailCards}
      />

      <DeckExportDialog
        deckId={deck.id}
        isDirty={false}
        open={exportOpen}
        onOpenChange={setExportOpen}
        cards={detailCards}
      />

      <DeckPrintDialog
        open={printOpen}
        onOpenChange={setPrintOpen}
        cards={detailCards}
        deckId={deck.id}
        deckName={deck.name}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <DialogForm onSubmit={handleDelete}>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete deck</AlertDialogTitle>
              <AlertDialogDescription>
                Delete &ldquo;{deck.name}&rdquo;? This cannot be undone.
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

      <DeckRenameDialog
        deckId={deck.id}
        currentName={deck.name}
        open={renameOpen}
        onOpenChange={setRenameOpen}
      />

      <DeckVariantsDialog
        deckId={deck.id}
        deckName={deck.name}
        open={variantsOpen}
        onOpenChange={setVariantsOpen}
      />

      <ManageDeckFoldersDialog open={foldersOpen} onOpenChange={setFoldersOpen} />
    </>
  );
}

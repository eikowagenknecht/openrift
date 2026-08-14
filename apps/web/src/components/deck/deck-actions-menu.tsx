import type { DeckListItemResponse, DeckResponse } from "@openrift/shared";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  CopyIcon,
  EllipsisVerticalIcon,
  FolderIcon,
  MonitorPlayIcon,
  PencilIcon,
  PinIcon,
  PinOffIcon,
  PrinterIcon,
  RefreshCwIcon,
  SettingsIcon,
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
  useCloneDeck,
  useDeleteDeck,
  useSetDeckArchived,
  useSetDeckPinned,
  useUpdateDeck,
} from "@/hooks/use-decks";
import { useDeckFormatList } from "@/hooks/use-enums";
import { useFeatureEnabled } from "@/hooks/use-feature-flags";
import { useRequiredUserId } from "@/lib/auth-session";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { toDeckBuilderCard } from "@/lib/deck-builder-card";

import { DeckExportDialog } from "./deck-export-dialog";
import { DeckRenameDialog } from "./deck-rename-dialog";
import { ManageDeckFoldersDialog } from "./manage-deck-folders-dialog";
import { ProxyExportDialog } from "./proxy-export-dialog";

/**
 * Dropdown menu with deck actions (export, proxies, rename, format toggle, clone, delete).
 * Owns its dialogs and mutations so both tile and list-row layouts can drop it in.
 * @returns The actions menu element.
 */
export function DeckActionsMenu({ item }: { item: DeckListItemResponse }) {
  const userId = useRequiredUserId();
  const { deck } = item;
  const navigate = useNavigate();
  const cloneDeck = useCloneDeck();
  const updateDeck = useUpdateDeck();
  const deleteDeck = useDeleteDeck();
  const setPinned = useSetDeckPinned();
  const setArchived = useSetDeckArchived();
  const { formats } = useDeckFormatList();
  // Presentation mode is a creator tool that ships dark: the route works by
  // URL, but nothing in the app points at it until the flag is on.
  const overlayEnabled = useFeatureEnabled("overlay");
  const otherFormats = formats.filter((entry) => entry.slug !== deck.format);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [proxyOpen, setProxyOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [foldersOpen, setFoldersOpen] = useState(false);

  const { data: folders } = useDeckFolders();
  const setDeckFolders = useSetDeckFolders();
  const folderList = folders ?? [];

  // Lazy-fetch full card detail only when export/proxy dialogs are open
  const needsDetail = exportOpen || proxyOpen;
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
    // Guard against double-submission: a second confirm (re-opened dialog,
    // rapid double-click) while the first delete is still in flight would
    // 404 on the server and surface a "Not found" toast.
    if (deleteDeck.isPending) {
      return;
    }
    deleteDeck.mutate(deck.id);
    setDeleteOpen(false);
  };

  const handleFormatChange = (event: React.MouseEvent, slug: string) => {
    stop(event);
    updateDeck.mutate({ deckId: deck.id, format: slug });
  };

  // Membership is replaced wholesale rather than patched, so the toggle sends
  // the full set the deck should end up in.
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
          {item.totalCards > 0 && (
            <DropdownMenuItem
              onClick={(event: React.MouseEvent) => {
                stop(event);
                setProxyOpen(true);
              }}
            >
              <PrinterIcon className="size-4" />
              Proxies
            </DropdownMenuItem>
          )}
          {overlayEnabled && item.totalCards > 0 && (
            <DropdownMenuItem
              onClick={(event: React.MouseEvent) => {
                stop(event);
                void navigate({ to: "/present", search: { deck: deck.id, i: 0 } });
              }}
            >
              <MonitorPlayIcon className="size-4" />
              Present
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={(event: React.MouseEvent) => {
              stop(event);
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
                  <DropdownMenuItem
                    key={entry.slug}
                    onClick={(event: React.MouseEvent) => handleFormatChange(event, entry.slug)}
                  >
                    {entry.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
          {/* "Add to" rather than "Move to": a deck can sit in several folders,
              so toggling one on doesn't take it out of the others. */}
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
                  onClick={(event: React.MouseEvent) => {
                    stop(event);
                    handleToggleFolder(folder.id);
                  }}
                >
                  {folder.name}
                </DropdownMenuCheckboxItem>
              ))}
              {folderList.length > 0 && <DropdownMenuSeparator />}
              <DropdownMenuItem
                onClick={(event: React.MouseEvent) => {
                  stop(event);
                  setFoldersOpen(true);
                }}
              >
                <SettingsIcon className="size-4" />
                Manage folders…
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem onClick={handleClone}>
            <CopyIcon className="size-4" />
            Duplicate
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
          <DialogForm onSubmit={handleDelete}>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete deck</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete &ldquo;{deck.name}&rdquo;? This cannot be undone.
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

      <ManageDeckFoldersDialog open={foldersOpen} onOpenChange={setFoldersOpen} />
    </>
  );
}

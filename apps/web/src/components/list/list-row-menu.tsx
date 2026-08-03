import type { ListResponse } from "@openrift/shared";
import { useNavigate } from "@tanstack/react-router";
import { EyeIcon, EyeOffIcon, LinkIcon, PencilIcon, Trash2Icon } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { toast } from "sonner";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useDeleteList, useSetListSidebarHidden } from "@/hooks/use-lists";
import { getSiteUrl } from "@/lib/site-config";

import { DeleteListDialog } from "./delete-list-dialog";
import { ListEditDialog } from "./list-edit-dialog";

interface ListRowMenuProps {
  list: ListResponse;
  /** True when this list's page is the one open — a delete has to navigate away. */
  isActive: boolean;
  children: ReactNode;
}

/**
 * Right-click (long-press on touch) menu for a list row in the collections
 * sidebar. Covers what the list summary already knows — rename and trade
 * defaults, the share link when the list is public, sidebar visibility and
 * delete. Actions that need the list's entries loaded (export, the share
 * dialog itself) stay on the list page.
 * @returns The row wrapped in a context-menu trigger, plus its dialogs.
 */
export function ListRowMenu({ list, isActive, children }: ListRowMenuProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const setSidebarHidden = useSetListSidebarHidden();
  const deleteList = useDeleteList();
  const navigate = useNavigate();

  const shareUrl =
    list.isPublic && list.shareToken ? `${getSiteUrl()}/lists/share/${list.shareToken}` : null;

  const handleCopyLink = async () => {
    if (!shareUrl) {
      return;
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Share link copied");
    } catch {
      // Clipboard writes never reach the global mutation error handler.
      toast.error("Couldn't copy the link");
    }
  };

  const handleDelete = () => {
    deleteList.mutate(list.id, {
      onSuccess: () => {
        setDeleteOpen(false);
        if (isActive) {
          void navigate({ to: "/collections" });
        }
      },
    });
  };

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger
          className="block select-none [-webkit-touch-callout:none]"
          render={<div />}
        >
          {children}
        </ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          <ContextMenuItem onClick={() => setEditOpen(true)}>
            <PencilIcon />
            Edit list
          </ContextMenuItem>
          {shareUrl && (
            <ContextMenuItem onClick={() => void handleCopyLink()}>
              <LinkIcon />
              Copy share link
            </ContextMenuItem>
          )}
          <ContextMenuSeparator />
          <ContextMenuItem
            onClick={() =>
              setSidebarHidden.mutate({ listId: list.id, hidden: !list.sidebarHidden })
            }
          >
            {list.sidebarHidden ? <EyeIcon /> : <EyeOffIcon />}
            {list.sidebarHidden ? "Show in sidebar" : "Hide behind Show more"}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2Icon />
            Delete list
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      {editOpen && (
        <ListEditDialog
          listId={list.id}
          intent={list.intent}
          currentName={list.name}
          currentTradeDefaults={list.tradeDefaults}
          currentCurrency={list.currency}
          open
          onOpenChange={setEditOpen}
        />
      )}
      {deleteOpen && (
        <DeleteListDialog
          open
          onOpenChange={setDeleteOpen}
          listName={list.name}
          kind={list.kind}
          entryCount={list.entryCount}
          onConfirm={handleDelete}
          isPending={deleteList.isPending}
        />
      )}
    </>
  );
}

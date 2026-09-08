import type { CollectionResponse } from "@openrift/shared/types/api/collection";
import { useNavigate } from "@tanstack/react-router";
import { EyeIcon, EyeOffIcon, LayersIcon, PencilIcon, Share2Icon, Trash2Icon } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  useDeleteCollection,
  useSetCollectionDeckbuilding,
  useSetCollectionSidebarHidden,
} from "@/features/collections/hooks/use-collections";

import { CollectionShareDialog } from "./collection-share-dialog";
import { DeleteCollectionDialog } from "./delete-collection-dialog";
import { EditCollectionDialog } from "./edit-collection-dialog";

interface CollectionRowMenuProps {
  collection: CollectionResponse;
  isActive: boolean;
  children: ReactNode;
}

export function CollectionRowMenu({ collection, isActive, children }: CollectionRowMenuProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const setSidebarHidden = useSetCollectionSidebarHidden();
  const setDeckbuilding = useSetCollectionDeckbuilding();
  const deleteCollection = useDeleteCollection();
  const navigate = useNavigate();

  const canAdmin = collection.viewerCanAdmin;
  const canDelete = canAdmin && !collection.isInbox;

  const handleDelete = () => {
    deleteCollection.mutate(collection.id, {
      onSuccess: () => {
        setDeleteOpen(false);
        // The route for this collection is gone; the server moved its copies
        // to the inbox, so land on the all-cards view.
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
          {canAdmin && (
            <ContextMenuItem onClick={() => setEditOpen(true)}>
              <PencilIcon />
              Edit collection
            </ContextMenuItem>
          )}
          <ContextMenuItem
            onClick={() =>
              setDeckbuilding.mutate({
                id: collection.id,
                available: !collection.availableForDeckbuilding,
              })
            }
          >
            <LayersIcon />
            {collection.availableForDeckbuilding
              ? "Exclude from my deck building"
              : "Include in my deck building"}
          </ContextMenuItem>
          {canAdmin && (
            <ContextMenuItem onClick={() => setShareOpen(true)}>
              <Share2Icon />
              Share
            </ContextMenuItem>
          )}
          {!collection.isInbox && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem
                onClick={() =>
                  setSidebarHidden.mutate({ id: collection.id, hidden: !collection.sidebarHidden })
                }
              >
                {collection.sidebarHidden ? <EyeIcon /> : <EyeOffIcon />}
                {collection.sidebarHidden ? "Show in sidebar" : "Hide behind Show more"}
              </ContextMenuItem>
            </>
          )}
          {canDelete && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
                <Trash2Icon />
                Delete collection
              </ContextMenuItem>
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>
      {editOpen && (
        <EditCollectionDialog
          collectionId={collection.id}
          currentName={collection.name}
          isInbox={collection.isInbox}
          availableForDeckbuilding={collection.availableForDeckbuilding}
          open
          onOpenChange={setEditOpen}
        />
      )}
      {shareOpen && (
        <CollectionShareDialog
          collectionId={collection.id}
          collectionName={collection.name}
          isPublic={collection.isPublic}
          shareToken={collection.shareToken}
          isGroupCollection={collection.groupId !== null}
          open
          onOpenChange={setShareOpen}
        />
      )}
      {deleteOpen && (
        <DeleteCollectionDialog
          open
          onOpenChange={setDeleteOpen}
          collectionName={collection.name}
          copyCount={collection.copyCount}
          onConfirm={handleDelete}
          isPending={deleteCollection.isPending}
        />
      )}
    </>
  );
}

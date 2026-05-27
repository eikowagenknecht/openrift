import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useCreateCollection } from "@/hooks/use-collections";

interface CreateCollectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (collectionId: string) => void;
  /**
   * Friend group slug to create the collection inside. When set, the collection
   * is shared with that group instead of being personal.
   */
  groupSlug?: string;
  /** Display name for the group, used in the dialog title/description. */
  groupName?: string;
}

/**
 * Name a new collection. Mirrors the CreateListDialog shape so the sidebar's
 * "+ New …" affordances feel consistent across collections and lists.
 * @returns The dialog component.
 */
export function CreateCollectionDialog({
  open,
  onOpenChange,
  onCreated,
  groupSlug,
  groupName,
}: CreateCollectionDialogProps) {
  const [name, setName] = useState("");
  const createCollection = useCreateCollection();
  const isShared = Boolean(groupSlug);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setName("");
    }
    onOpenChange(next);
  };

  const handleSubmit = () => {
    const trimmed = name.trim();
    if (!trimmed || createCollection.isPending) {
      return;
    }
    createCollection.mutate(
      { name: trimmed, ...(groupSlug ? { groupSlug } : {}) },
      {
        onSuccess: (collection) => {
          onCreated?.(collection.id);
          handleOpenChange(false);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isShared ? "New shared collection" : "New collection"}</DialogTitle>
          <DialogDescription>
            {isShared
              ? `Shared with ${groupName ?? "this group"}. Any member can add or remove cards; group admins can rename or delete it.`
              : "A collection holds physical copies you own. You can rename or delete it later."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            handleSubmit();
          }}
        >
          <Input
            autoFocus // oxlint-disable-line jsx-a11y/no-autofocus -- intentional inside dialog
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Collection name"
          />
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleOpenChange(false)}
              disabled={createCollection.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || createCollection.isPending}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

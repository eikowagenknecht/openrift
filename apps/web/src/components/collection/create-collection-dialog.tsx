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
}: CreateCollectionDialogProps) {
  const [name, setName] = useState("");
  const createCollection = useCreateCollection();

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
      { name: trimmed },
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
          <DialogTitle>New collection</DialogTitle>
          <DialogDescription>
            A collection holds physical copies you own. You can rename or delete it later.
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

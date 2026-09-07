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
  groupSlug?: string;
  groupName?: string;
  title?: string;
  description?: string;
  availableForDeckbuilding?: boolean;
}

export function CreateCollectionDialog({
  open,
  onOpenChange,
  onCreated,
  groupSlug,
  groupName,
  title,
  description,
  availableForDeckbuilding,
}: CreateCollectionDialogProps) {
  const [name, setName] = useState("");
  const createCollection = useCreateCollection();
  const isShared = Boolean(groupSlug);
  const effectiveDescription =
    description ??
    (isShared
      ? `Shared with ${groupName ?? "this group"}. Any member can add or remove cards. Admins can rename or delete it.`
      : undefined);

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
      {
        name: trimmed,
        ...(groupSlug ? { groupSlug } : {}),
        ...(availableForDeckbuilding === undefined ? {} : { availableForDeckbuilding }),
      },
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
          <DialogTitle>
            {title ?? (isShared ? "New shared collection" : "New collection")}
          </DialogTitle>
          {effectiveDescription !== undefined && (
            <DialogDescription>{effectiveDescription}</DialogDescription>
          )}
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

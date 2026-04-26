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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useUpdateCollection } from "@/hooks/use-collections";

interface EditCollectionDialogProps {
  collectionId: string;
  currentName: string;
  currentAvailableForDeckbuilding: boolean;
  isInbox: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditCollectionDialog({
  collectionId,
  currentName,
  currentAvailableForDeckbuilding,
  isInbox,
  open,
  onOpenChange,
}: EditCollectionDialogProps) {
  const [name, setName] = useState(currentName);
  const [availableForDeckbuilding, setAvailableForDeckbuilding] = useState(
    currentAvailableForDeckbuilding,
  );
  const updateCollection = useUpdateCollection();

  const handleSubmit = () => {
    const trimmed = name.trim();
    const updates: { name?: string; availableForDeckbuilding?: boolean } = {};
    if (trimmed && trimmed !== currentName) {
      updates.name = trimmed;
    }
    if (!isInbox && availableForDeckbuilding !== currentAvailableForDeckbuilding) {
      updates.availableForDeckbuilding = availableForDeckbuilding;
    }
    if (Object.keys(updates).length === 0) {
      onOpenChange(false);
      return;
    }
    updateCollection.mutate(
      { id: collectionId, ...updates },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          setName(currentName);
          setAvailableForDeckbuilding(currentAvailableForDeckbuilding);
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit collection</DialogTitle>
          <DialogDescription>
            Rename this collection or change whether its cards count toward deck building.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="collection-name">Name</Label>
            <Input
              id="collection-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  handleSubmit();
                }
              }}
              maxLength={200}
              disabled={isInbox}
              // oxlint-disable-next-line jsx-a11y/no-autofocus -- intentional: dialog input should grab focus
              autoFocus
            />
            {isInbox && (
              <p className="text-muted-foreground text-xs">
                The Inbox collection can&apos;t be renamed.
              </p>
            )}
          </div>
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <Label htmlFor="available-for-deckbuilding">Available for deck building</Label>
              <p className="text-muted-foreground text-xs">
                When off, copies in this collection won&apos;t count as owned in the deck builder or
                shopping list.
              </p>
            </div>
            <Switch
              id="available-for-deckbuilding"
              checked={availableForDeckbuilding}
              onCheckedChange={setAvailableForDeckbuilding}
              disabled={isInbox}
            />
          </div>
          {isInbox && (
            <p className="text-muted-foreground text-xs">
              The Inbox is always available for deck building.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={updateCollection.isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || updateCollection.isPending}>
            {updateCollection.isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DialogForm } from "@/components/ui/dialog-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useSetCollectionDeckbuilding,
  useUpdateCollection,
} from "@/features/collections/hooks/use-collections";

interface EditCollectionDialogProps {
  collectionId: string;
  currentName: string;
  isInbox: boolean;
  availableForDeckbuilding: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditCollectionDialog({
  collectionId,
  currentName,
  isInbox,
  availableForDeckbuilding,
  open,
  onOpenChange,
}: EditCollectionDialogProps) {
  const [name, setName] = useState(currentName);
  const [deckbuildingAvailable, setDeckbuildingAvailable] = useState(availableForDeckbuilding);
  const updateCollection = useUpdateCollection();
  const setDeckbuilding = useSetCollectionDeckbuilding();

  // BaseUI's Dialog only fires onOpenChange for user-initiated changes, not
  // when the parent toggles the controlled `open` prop, so seed on both.
  const [seed, setSeed] = useState({ open, currentName, availableForDeckbuilding });
  if (
    seed.open !== open ||
    seed.currentName !== currentName ||
    seed.availableForDeckbuilding !== availableForDeckbuilding
  ) {
    setSeed({ open, currentName, availableForDeckbuilding });
    if (open) {
      setName(currentName);
      setDeckbuildingAvailable(availableForDeckbuilding);
    }
  }

  const isPending = updateCollection.isPending || setDeckbuilding.isPending;

  const handleSubmit = async () => {
    const trimmed = name.trim();
    const nameChanged = trimmed.length > 0 && trimmed !== currentName;
    const deckbuildingChanged = deckbuildingAvailable !== availableForDeckbuilding;

    if (!nameChanged && !deckbuildingChanged) {
      onOpenChange(false);
      return;
    }

    const pending: Promise<unknown>[] = [];
    if (nameChanged) {
      pending.push(updateCollection.mutateAsync({ id: collectionId, name: trimmed }));
    }
    if (deckbuildingChanged) {
      pending.push(
        setDeckbuilding.mutateAsync({ id: collectionId, available: deckbuildingAvailable }),
      );
    }
    await Promise.allSettled(pending);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogForm onSubmit={() => void handleSubmit()}>
          <DialogHeader>
            <DialogTitle>Edit collection</DialogTitle>
            <DialogDescription>Rename this collection.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="collection-name">Name</Label>
              <Input
                id="collection-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
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
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="collection-deckbuilding"
                  checked={deckbuildingAvailable}
                  onCheckedChange={(checked) => setDeckbuildingAvailable(checked === true)}
                />
                <Label htmlFor="collection-deckbuilding">Available for deck building</Label>
              </div>
              <p className="text-muted-foreground text-xs">
                Cards here count toward decks you build.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || isPending}>
              {isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogForm>
      </DialogContent>
    </Dialog>
  );
}

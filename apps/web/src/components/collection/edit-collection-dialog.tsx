import { useEffect, useState } from "react";

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
import { useUpdateCollection } from "@/hooks/use-collections";

interface EditCollectionDialogProps {
  collectionId: string;
  currentName: string;
  isInbox: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Renames a collection (owner/admin only). Deck-building availability is no
// longer edited here — it's a per-viewer preference toggled from the
// collection actions menu, available to every member.
export function EditCollectionDialog({
  collectionId,
  currentName,
  isInbox,
  open,
  onOpenChange,
}: EditCollectionDialogProps) {
  const [name, setName] = useState(currentName);
  const updateCollection = useUpdateCollection();

  // BaseUI's Dialog only fires onOpenChange for user-initiated changes
  // (Esc / backdrop / close button), not when the parent toggles the
  // controlled `open` prop. The dialog stays mounted across collection
  // navigations, so useState seeds would otherwise stick to whichever
  // collection was current when the component first mounted.
  useEffect(() => {
    if (open) {
      setName(currentName);
    }
  }, [open, currentName]);

  const handleSubmit = () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === currentName) {
      onOpenChange(false);
      return;
    }
    updateCollection.mutate(
      { id: collectionId, name: trimmed },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
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

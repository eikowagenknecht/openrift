import type { CollectionResponse } from "@openrift/shared";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DialogForm } from "@/components/ui/dialog-form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ScanAddAllDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collections: CollectionResponse[];
  count: number;
  targetId?: string;
  onConfirm: (collectionId: string) => void;
}

// Readings the session only identified turn into real copies in one go; the
// collection choice defaults to the scanner's current target, or the inbox.
export function ScanAddAllDialog({
  open,
  onOpenChange,
  collections,
  count,
  targetId,
  onConfirm,
}: ScanAddAllDialogProps) {
  const preselected = collections.some((collection) => collection.id === targetId)
    ? targetId
    : undefined;
  const defaultId =
    preselected ??
    collections.find((collection) => collection.isInbox)?.id ??
    collections[0]?.id ??
    "";
  // Null until the user picks one, so the default above wins on every open.
  const [collectionId, setCollectionId] = useState<string | null>(null);
  const chosen =
    collectionId !== null && collections.some((collection) => collection.id === collectionId)
      ? collectionId
      : defaultId;
  const items = collections.map((collection) => ({
    value: collection.id,
    label: collection.name,
  }));
  const cardWord = count === 1 ? "card" : "cards";

  // BaseUI's dialog only fires onOpenChange for user-initiated changes, and
  // the scan page keeps this mounted for the whole session, so a stale pick
  // would otherwise outlive the target the user switched to in between.
  const [seededOpen, setSeededOpen] = useState(open);
  if (seededOpen !== open) {
    setSeededOpen(open);
    if (open) {
      setCollectionId(null);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <DialogForm
          onSubmit={() => {
            onOpenChange(false);
            onConfirm(chosen);
          }}
        >
          <AlertDialogTitle>Add the scanned cards to a collection?</AlertDialogTitle>
          <AlertDialogDescription>
            Every card this session identified becomes a copy in the collection you pick, with the
            counts as they stand in the list.
          </AlertDialogDescription>
          <Select
            items={items}
            value={chosen}
            onValueChange={(value) => {
              if (value) {
                setCollectionId(value);
              }
            }}
          >
            <SelectTrigger aria-label="Collection to add to" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {items.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {targetId === undefined ? "Keep just identifying" : "Cancel"}
            </Button>
            <Button type="submit" disabled={chosen === "" || count === 0}>
              Add {count} {cardWord}
            </Button>
          </div>
        </DialogForm>
      </AlertDialogContent>
    </AlertDialog>
  );
}

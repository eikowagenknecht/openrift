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
  /** The viewer's collections, in display order. */
  collections: CollectionResponse[];
  /** How many identify-only cards the commit would add. */
  count: number;
  /** Commit the session to the chosen collection. */
  onConfirm: (collectionId: string) => void;
}

/**
 * The "scan first, decide later" commit step: an identify-only session has
 * counted the cards, and this dialog turns the whole list into real copies in
 * one go. The collection choice defaults to the inbox, matching where an
 * undecided scan would have landed anyway.
 *
 * @returns The add-all confirmation dialog.
 */
export function ScanAddAllDialog({
  open,
  onOpenChange,
  collections,
  count,
  onConfirm,
}: ScanAddAllDialogProps) {
  const defaultId =
    collections.find((collection) => collection.isInbox)?.id ?? collections[0]?.id ?? "";
  const [collectionId, setCollectionId] = useState(defaultId);
  const chosen = collections.some((collection) => collection.id === collectionId)
    ? collectionId
    : defaultId;
  const items = collections.map((collection) => ({
    value: collection.id,
    label: collection.name,
  }));
  const cardWord = count === 1 ? "card" : "cards";

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
              Keep just identifying
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

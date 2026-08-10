import { useQuery } from "@tanstack/react-query";
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
import { DialogForm } from "@/components/ui/dialog-form";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUpdateDeck } from "@/hooks/use-decks";
import { useUserId } from "@/lib/auth-session";
import { collectionsQueryOptions } from "@/lib/collections-query";

/** Sentinel for "no home collection" — Select values must be strings. */
const NONE = "none";

interface DeckHomeCollectionDialogProps {
  deckId: string;
  currentCollectionId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Picks the collection a deck is physically stored in. Copies in that
 * collection count as available for this deck even when the collection is
 * excluded from deck building, which is what lets a sleeved deck sit in its own
 * deckbox without every other deck cannibalizing it.
 * @returns The dialog.
 */
export function DeckHomeCollectionDialog({
  deckId,
  currentCollectionId,
  open,
  onOpenChange,
}: DeckHomeCollectionDialogProps) {
  const userId = useUserId();
  const [value, setValue] = useState(currentCollectionId ?? NONE);
  const updateDeck = useUpdateDeck();
  const { data: collections } = useQuery({
    ...collectionsQueryOptions(userId ?? ""),
    enabled: open && Boolean(userId),
  });

  const items = [
    { value: NONE, label: "Not stored anywhere" },
    ...(collections ?? []).map((collection) => ({
      value: collection.id,
      label: collection.groupName === null ? collection.name : `${collection.name} (group)`,
    })),
  ];

  const handleSubmit = () => {
    const next = value === NONE ? null : value;
    if (next !== currentCollectionId) {
      updateDeck.mutate({ deckId, collectionId: next });
    }
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          setValue(currentCollectionId ?? NONE);
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent>
        <DialogForm onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Stored in</DialogTitle>
            <DialogDescription>
              Pick the collection this deck physically lives in. Its cards stay available for this
              deck even when the collection is turned off for deck building, so a sleeved deck
              doesn&apos;t look like it is missing its own cards.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="deck-home-collection">Collection</Label>
            <Select
              items={items}
              value={value}
              onValueChange={(next) => setValue(next ?? NONE)}
              disabled={!collections}
            >
              <SelectTrigger id="deck-home-collection" className="w-full">
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
          </div>

          <DialogFooter>
            <Button type="submit" disabled={updateDeck.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogForm>
      </DialogContent>
    </Dialog>
  );
}

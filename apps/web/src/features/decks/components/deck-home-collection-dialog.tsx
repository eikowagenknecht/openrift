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
import { CreateCollectionDialog } from "@/features/collections/components/create-collection-dialog";
import { collectionsQueryOptions } from "@/features/collections/lib/collections-query";
import { useUpdateDeck } from "@/features/decks/hooks/use-decks";
import { sharedBoxWarning } from "@/features/decks/lib/deck-box-label";
import { useUserId } from "@/lib/auth-session";

const NONE = "none";
const NEW = "new";

interface DeckHomeCollectionDialogProps {
  deckId: string;
  currentCollectionId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Copies in the picked collection count as available for this deck even when
 * the collection is excluded from deck building. Only personal collections
 * are pickable; group binders are shared and can't be a deck's box.
 */
export function DeckHomeCollectionDialog({
  deckId,
  currentCollectionId,
  open,
  onOpenChange,
}: DeckHomeCollectionDialogProps) {
  const userId = useUserId();
  const [value, setValue] = useState(currentCollectionId ?? NONE);
  const [createOpen, setCreateOpen] = useState(false);
  const updateDeck = useUpdateDeck();
  const { data: collections } = useQuery({
    ...collectionsQueryOptions(userId ?? ""),
    enabled: open && Boolean(userId),
  });

  const pickable = (collections ?? []).filter(
    (collection) => collection.groupId === null || collection.id === currentCollectionId,
  );
  const items = [
    { value: NONE, label: "Not stored anywhere" },
    ...pickable.map((collection) => ({
      value: collection.id,
      label: collection.groupId === null ? collection.name : `${collection.name} (group)`,
    })),
    { value: NEW, label: "New deck box…" },
  ];

  // A group binder the deck was linked to before the personal-only rule: shown
  // so the dialog can still name where the deck lives, but not re-selectable.
  const currentIsGroup = pickable.some(
    (collection) => collection.id === currentCollectionId && collection.groupId !== null,
  );
  const selected = pickable.find((collection) => collection.id === value);
  const warning = selected
    ? sharedBoxWarning(
        selected.name,
        selected.homeDecks.filter((deck) => deck.id !== deckId),
      )
    : undefined;

  const save = (next: string | null) => {
    if (next !== currentCollectionId) {
      updateDeck.mutate({ deckId, collectionId: next });
    }
    onOpenChange(false);
  };

  const handleSubmit = () => {
    save(value === NONE ? null : value);
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
              Its cards stay available to this deck even when the collection is off for deck
              building.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="deck-home-collection">Collection</Label>
            <Select
              items={items}
              value={value}
              onValueChange={(next) => {
                // "New deck box…" is an action, not a value: leave the current
                // pick alone and let the create dialog decide the new one.
                if (next === NEW) {
                  setCreateOpen(true);
                  return;
                }
                setValue(next ?? NONE);
              }}
              disabled={!collections}
            >
              <SelectTrigger id="deck-home-collection" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {items.map((item) => (
                  <SelectItem
                    key={item.value}
                    value={item.value}
                    disabled={currentIsGroup && item.value === currentCollectionId}
                  >
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {warning && <p className="text-muted-foreground text-xs">{warning}</p>}
          </div>

          <DialogFooter>
            <Button type="submit" disabled={updateDeck.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogForm>
      </DialogContent>
      <CreateCollectionDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="New deck box"
        description="A deck box holds the cards of one deck. It starts out excluded from deck building, so its cards only count for the deck stored in it."
        availableForDeckbuilding={false}
        onCreated={(collectionId) => {
          setValue(collectionId);
          save(collectionId);
        }}
      />
    </Dialog>
  );
}

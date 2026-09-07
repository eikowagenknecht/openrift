import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DialogForm } from "@/components/ui/dialog-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUpdateDeckMeta } from "@/features/decks/hooks/use-decks";

interface DeckRenameDialogProps {
  deckId: string;
  currentName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeckRenameDialog({
  deckId,
  currentName,
  open,
  onOpenChange,
}: DeckRenameDialogProps) {
  const [draft, setDraft] = useState(currentName);
  const { update } = useUpdateDeckMeta(deckId);

  const handleSubmit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== currentName) {
      update({ name: trimmed });
    }
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          setDraft(currentName);
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent>
        <DialogForm onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Rename deck</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="deck-rename-name">Name</Label>
            <Input
              id="deck-rename-name"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={200}
              // oxlint-disable-next-line jsx-a11y/no-autofocus -- intentional: dialog input should grab focus
              autoFocus
            />
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button type="submit" disabled={!draft.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogForm>
      </DialogContent>
    </Dialog>
  );
}

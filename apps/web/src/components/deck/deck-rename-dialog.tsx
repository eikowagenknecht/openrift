import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useUpdateDeck } from "@/hooks/use-decks";

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
  const updateDeck = useUpdateDeck();

  const handleSubmit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== currentName) {
      updateDeck.mutate({ deckId, name: trimmed });
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
        <DialogHeader>
          <DialogTitle>Rename deck</DialogTitle>
        </DialogHeader>
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              handleSubmit();
            }
          }}
          maxLength={200}
          // oxlint-disable-next-line jsx-a11y/no-autofocus -- intentional: dialog input should grab focus
          autoFocus
        />
        <DialogFooter>
          <Button onClick={handleSubmit} disabled={!draft.trim()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

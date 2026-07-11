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
import { Textarea } from "@/components/ui/textarea";
import { useUpdateDeckMeta } from "@/hooks/use-decks";

interface DeckDescriptionDialogProps {
  deckId: string;
  currentDescription: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeckDescriptionDialog({
  deckId,
  currentDescription,
  open,
  onOpenChange,
}: DeckDescriptionDialogProps) {
  const [draft, setDraft] = useState(currentDescription ?? "");
  const { update } = useUpdateDeckMeta(deckId);

  const handleSubmit = () => {
    const trimmed = draft.trim();
    const current = currentDescription ?? "";
    if (trimmed !== current) {
      update({ description: trimmed === "" ? null : trimmed });
    }
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          setDraft(currentDescription ?? "");
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent>
        <DialogForm onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit description</DialogTitle>
            <DialogDescription>
              Add notes, strategy, or mulligan tips. Markdown supported (links, lists, bold,
              italics, inline code).
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={2000}
            rows={8}
            placeholder="A few words about your deck…"
            // oxlint-disable-next-line jsx-a11y/no-autofocus -- intentional: dialog input should grab focus
            autoFocus
          />
          <DialogFooter>
            <Button type="submit">Save</Button>
          </DialogFooter>
        </DialogForm>
      </DialogContent>
    </Dialog>
  );
}

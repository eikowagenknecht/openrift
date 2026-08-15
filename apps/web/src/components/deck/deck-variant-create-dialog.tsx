import { formatDay } from "@openrift/shared";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DialogForm } from "@/components/ui/dialog-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { DeckVariantMode } from "@/hooks/use-decks";
import { useCreateDeckVariant } from "@/hooks/use-decks";

interface DeckVariantCreateDialogProps {
  deckId: string;
  deckName: string;
  mode: DeckVariantMode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MODE_COPY: Record<DeckVariantMode, { title: string; description: string; confirm: string }> =
  {
    checkpoint: {
      title: "Save checkpoint",
      description:
        "Saves a copy of the current list as a previous version. You keep editing this deck.",
      confirm: "Save checkpoint",
    },
    variant: {
      title: "New variant",
      description:
        "Creates an editable copy linked to this deck, so both builds live side by side.",
      confirm: "Create variant",
    },
  };

/**
 * The name a new copy starts with. Checkpoints are dated because they mark a
 * point in time; variants are named after what they are.
 * @returns The prefilled name for `mode`.
 */
export function defaultVariantName(deckName: string, mode: DeckVariantMode): string {
  if (mode === "checkpoint") {
    return `${deckName} (${formatDay(new Date())})`;
  }
  return `${deckName} (variant)`;
}

/**
 * Names and creates a copy of a deck (ADR-042): a checkpoint keeps you on the
 * live deck, a variant takes you to the new one.
 * @returns The create-variant dialog element.
 */
export function DeckVariantCreateDialog({
  deckId,
  deckName,
  mode,
  open,
  onOpenChange,
}: DeckVariantCreateDialogProps) {
  const [draft, setDraft] = useState(() => defaultVariantName(deckName, mode));
  const createVariant = useCreateDeckVariant();
  const navigate = useNavigate();
  const copy = MODE_COPY[mode];

  // Both modes share one dialog instance per surface, so the name is re-seeded
  // on every open rather than at mount: the mode (and the date) may have
  // changed since the last time it was shown.
  useEffect(() => {
    if (open) {
      setDraft(defaultVariantName(deckName, mode));
    }
  }, [open, deckName, mode]);

  const handleSubmit = () => {
    const trimmed = draft.trim();
    if (trimmed.length === 0 || createVariant.isPending) {
      return;
    }
    createVariant.mutate(
      { deckId, mode, name: trimmed },
      {
        onSuccess: (created) => {
          onOpenChange(false);
          if (mode === "checkpoint") {
            toast.success("Checkpoint saved");
            return;
          }
          void navigate({ to: "/decks/$deckId", params: { deckId: created.id } });
        },
        // Errors are reported by the global mutation error toast.
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogForm onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{copy.title}</DialogTitle>
            <DialogDescription>{copy.description}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="deck-variant-name">Name</Label>
            <Input
              id="deck-variant-name"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={200}
              // oxlint-disable-next-line jsx-a11y/no-autofocus -- intentional: dialog input should grab focus
              autoFocus
            />
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button type="submit" disabled={draft.trim().length === 0 || createVariant.isPending}>
              {copy.confirm}
            </Button>
          </DialogFooter>
        </DialogForm>
      </DialogContent>
    </Dialog>
  );
}

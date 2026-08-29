import { useNavigate } from "@tanstack/react-router";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateDeckVariant } from "@/hooks/use-decks";

interface DeckVariantCreateDialogProps {
  deckId: string;
  deckName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TITLE = "New variant";
const DESCRIPTION = "Creates an editable copy, kept alongside this deck as another version of it.";

/**
 * The name a new variant starts with: the version it branches from, marked as a
 * variant of it.
 * @returns The prefilled name.
 */
export function defaultVariantName(deckName: string): string {
  return `${deckName} (variant)`;
}

/**
 * Names and creates a copy of a deck (ADR-042), then opens the copy.
 *
 * Two arrangements, picked by `layout`. `"dialog"` owns a dialog's whole body,
 * header and footer included. `"inline"` is the same form expanded inside a
 * surface that is already open — the variants dialog uses it so cancelling drops
 * you back where you were rather than onto the page behind a closed modal.
 *
 * `sources` turns the branch point into a choice: with more than one entry the
 * form offers a "Came from" picker, and the copy is made from whichever version
 * is picked. Without it the form always copies `deckId`.
 *
 * @returns The create-variant form element.
 */
export function DeckVariantCreateForm({
  deckId,
  deckName,
  layout,
  open = true,
  sources,
  onCancel,
  onCreated,
}: {
  deckId: string;
  deckName: string;
  layout: "dialog" | "inline";
  /** Only meaningful for `"dialog"`: re-seeds the form each time it opens. */
  open?: boolean;
  sources?: { value: string; label: string }[];
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [sourceId, setSourceId] = useState(deckId);
  const [draft, setDraft] = useState(() => defaultVariantName(deckName));
  const createVariant = useCreateDeckVariant();
  const navigate = useNavigate();
  const inputId = `deck-variant-name-${layout}`;
  const showSources = sources !== undefined && sources.length > 1;
  const sourceName = sources?.find((item) => item.value === sourceId)?.label ?? deckName;

  // One form instance per surface outlives any single use of it, so the fields
  // are re-seeded on every open rather than at mount: the deck (and so the
  // default name) may have changed since the last time it was shown.
  const [seed, setSeed] = useState({ open, deckId, deckName });
  if (seed.open !== open || seed.deckId !== deckId || seed.deckName !== deckName) {
    setSeed({ open, deckId, deckName });
    if (open) {
      setSourceId(deckId);
      setDraft(defaultVariantName(deckName));
    }
  }

  const handleSourceChange = (value: string | null) => {
    const nextId = value ?? deckId;
    const next = sources?.find((item) => item.value === nextId);
    setSourceId(nextId);
    if (next && draft === defaultVariantName(sourceName)) {
      // The name is still the one we filled in, so it follows the branch point
      // instead of stranding the reader with another version's name.
      setDraft(defaultVariantName(next.label));
    }
  };

  const handleSubmit = () => {
    const trimmed = draft.trim();
    if (trimmed.length === 0 || createVariant.isPending) {
      return;
    }
    createVariant.mutate(
      { deckId: sourceId, name: trimmed },
      {
        onSuccess: (created) => {
          onCreated();
          void navigate({ to: "/decks/$deckId", params: { deckId: created.id } });
        },
        // Errors are reported by the global mutation error toast.
      },
    );
  };

  const fields = (
    <div className="flex min-w-0 flex-col gap-3">
      {showSources && (
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor={`deck-variant-source-${layout}`}>Came from</Label>
          <Select items={sources} value={sourceId} onValueChange={handleSourceChange}>
            <SelectTrigger id={`deck-variant-source-${layout}`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sources.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="flex min-w-0 flex-col gap-2">
        <Label htmlFor={inputId}>Name</Label>
        <Input
          id={inputId}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={200}
          // oxlint-disable-next-line jsx-a11y/no-autofocus -- intentional: the form only appears on demand, so it should grab focus
          autoFocus
        />
      </div>
    </div>
  );
  const actions = (
    <>
      <Button variant="outline" onClick={onCancel}>
        Cancel
      </Button>
      <Button type="submit" disabled={draft.trim().length === 0 || createVariant.isPending}>
        Create variant
      </Button>
    </>
  );

  if (layout === "dialog") {
    return (
      <DialogForm onSubmit={handleSubmit}>
        <DialogHeader>
          <DialogTitle>{TITLE}</DialogTitle>
          <DialogDescription>{DESCRIPTION}</DialogDescription>
        </DialogHeader>
        {fields}
        <DialogFooter>{actions}</DialogFooter>
      </DialogForm>
    );
  }

  return (
    <form
      className="bg-muted/40 flex min-w-0 flex-col gap-3 rounded-md p-3"
      onSubmit={(event) => {
        event.preventDefault();
        handleSubmit();
      }}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="font-medium">{TITLE}</span>
        <span className="text-muted-foreground text-sm">{DESCRIPTION}</span>
      </div>
      {fields}
      <div className="flex justify-end gap-2">{actions}</div>
    </form>
  );
}

/**
 * The create-variant form as its own dialog, for surfaces with no open panel to
 * expand into (the rail's "+" button, the deck editor's menu).
 *
 * @returns The create-variant dialog element.
 */
export function DeckVariantCreateDialog({
  deckId,
  deckName,
  open,
  onOpenChange,
}: DeckVariantCreateDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DeckVariantCreateForm
          deckId={deckId}
          deckName={deckName}
          layout="dialog"
          open={open}
          onCancel={() => onOpenChange(false)}
          onCreated={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

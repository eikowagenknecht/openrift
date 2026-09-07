import { capitalize } from "@openrift/shared";
import { useState } from "react";

import { TagMultiSelect } from "@/components/deck/format-tag-multi-select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DialogForm } from "@/components/ui/dialog-form";
import { Label } from "@/components/ui/label";
import { useFilterActions } from "@/hooks/use-card-filters";
import { useUpdateDeck } from "@/hooks/use-decks";
import { getFormatTagConfig } from "@/lib/format-tag-config";

interface Props {
  deckId: string;
  format: string;
  currentSlugs: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Cards that no longer carry one of the new tags get flagged after save; they aren't removed automatically. */
export function EditFormatTagsDialog({ deckId, format, currentSlugs, open, onOpenChange }: Props) {
  const config = getFormatTagConfig(format);
  const updateDeck = useUpdateDeck();
  const { setArrayFilter } = useFilterActions();
  const [selected, setSelected] = useState<string[]>(currentSlugs);

  // `onOpenChange` only fires when the dialog closes itself, not when the
  // parent flips `open=true`, so the reset is driven off the `open` prop directly.
  const [seed, setSeed] = useState({ open, currentSlugs });
  if (seed.open !== open || seed.currentSlugs !== currentSlugs) {
    setSeed({ open, currentSlugs });
    if (open) {
      setSelected(currentSlugs);
    }
  }

  if (!config) {
    return null;
  }

  const handleSave = () => {
    if (selected.length === 0) {
      return;
    }
    updateDeck.mutate(
      { deckId, formatConfig: { tagSlugs: selected } },
      {
        onSuccess: () => {
          // Overwrites any narrower filter the user had set: re-picking format
          // defaults is expected to be a fresh start.
          setArrayFilter("customTags", selected);
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogForm onSubmit={handleSave}>
          <DialogHeader>
            <DialogTitle>Change {config.nounPlural}</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">
            Cards that don&apos;t carry one of the chosen {config.nounPlural} stay in the deck but
            get flagged as invalid until you remove them or pick a wider {config.noun} set.
          </p>
          <div className="space-y-2">
            <Label htmlFor="edit-format-tag-picker">{capitalize(config.nounPlural)}</Label>
            <TagMultiSelect
              triggerId="edit-format-tag-picker"
              category={config.category}
              nounPlural={config.nounPlural}
              selected={selected}
              onChange={setSelected}
              triggerClassName="w-full"
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={selected.length === 0 || updateDeck.isPending}>
              {updateDeck.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogForm>
      </DialogContent>
    </Dialog>
  );
}

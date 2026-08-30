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
  /** Deck format slug — drives which tag category + noun the dialog uses. */
  format: string;
  /** Currently chosen tag slugs from `decks.format_config.tagSlugs`. */
  currentSlugs: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Edit dialog that lets the user re-pick tags for an existing tag-locked
 * deck format. Generic across formats — the tag category and noun come
 * from the per-format config table (see `getFormatTagConfig`). Cards that
 * no longer carry one of the new tags get flagged after save; they aren't
 * removed automatically.
 *
 * @returns The dialog. Mounted controlled (open/onOpenChange) so the
 *   parent owns the visibility state alongside other dialogs.
 */
export function EditFormatTagsDialog({ deckId, format, currentSlugs, open, onOpenChange }: Props) {
  const config = getFormatTagConfig(format);
  const updateDeck = useUpdateDeck();
  const { setArrayFilter } = useFilterActions();
  const [selected, setSelected] = useState<string[]>(currentSlugs);

  // Reset local edits every time the dialog opens. The Dialog primitive's
  // `onOpenChange` callback only fires when the dialog closes itself (Esc,
  // outside click); when the parent flips `open=true` via the Edit button
  // it doesn't get called. Driving the reset off the `open` prop directly
  // means unsaved edits never leak across opens.
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
          // Reset the Custom Tags chip filter to match the new tag set.
          // Any narrower filter the user had set gets overwritten — the
          // expectation when re-picking format defaults is a fresh start.
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

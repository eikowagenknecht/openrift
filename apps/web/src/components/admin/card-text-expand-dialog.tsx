import { Maximize2Icon } from "lucide-react";
import { useState } from "react";

import { CardTextInput } from "@/components/contribute/card-text-input";
import type { CardTextVariant } from "@/components/contribute/card-text-input";
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

interface CardTextExpandDialogProps {
  /** Field label, shown in the dialog title and on the editor. */
  label: string;
  /** Current value to seed the editor with when opened. */
  value: string;
  /** Card image to copywrite from, shown beside the editor. */
  imageUrl?: string | null;
  /** Commit the edited text (empty string clears the field). */
  onSave: (next: string) => void;
  /** Editor variant — "rules" (default) or "flavor". */
  variant?: CardTextVariant;
  /** Optional reformat transform (shows a "Fix" button in the editor). */
  reformat?: (value: string) => string;
  /** Extra classes for the trigger button. */
  triggerClassName?: string;
}

/**
 * A maximize button that opens a full editor for a rich card-text field: the
 * card image on the left (what you copywrite from) and the token toolbar + live
 * preview on the right. Edits are held locally and committed on Save.
 *
 * @returns The trigger button plus its dialog.
 */
export function CardTextExpandDialog({
  label,
  value,
  imageUrl,
  onSave,
  variant,
  reformat,
  triggerClassName,
}: CardTextExpandDialogProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={`Expand ${label} editor`}
        title={`Expand ${label} editor`}
        className={triggerClassName}
        onClick={() => {
          setDraft(value);
          setOpen(true);
        }}
      >
        <Maximize2Icon className="size-3.5" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-4xl">
          <DialogForm
            onSubmit={() => {
              onSave(draft);
              setOpen(false);
            }}
          >
            <DialogHeader>
              <DialogTitle>Edit {label}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,20rem)_1fr]">
              <div className="self-start sm:sticky sm:top-0">
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt="Card reference"
                    className="max-h-[70vh] w-full rounded-md object-contain"
                  />
                ) : (
                  <div className="text-muted-foreground border-input flex h-40 items-center justify-center rounded-md border border-dashed px-3 text-center">
                    No image available for this printing.
                  </div>
                )}
              </div>
              <CardTextInput
                label={label}
                value={draft}
                onChange={setDraft}
                rows={6}
                variant={variant}
                reformat={reformat}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                className="text-destructive sm:mr-auto"
                onClick={() => {
                  onSave("");
                  setOpen(false);
                }}
              >
                Clear
              </Button>
              <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
              <Button type="submit">Save</Button>
            </DialogFooter>
          </DialogForm>
        </DialogContent>
      </Dialog>
    </>
  );
}

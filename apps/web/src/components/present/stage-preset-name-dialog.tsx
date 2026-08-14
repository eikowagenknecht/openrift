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
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

/** Matches the name limit the contract enforces, so a field stops before the API does. */
export const MAX_PRESET_NAME_LENGTH = 60;

/**
 * The one thing saving or renaming a preset asks for.
 *
 * Shared by both surfaces that keep presets — the stage's settings popover and
 * the Stage's OBS output — so a preset is named the same way wherever it is made.
 * The dialog only collects the name: the caller owns the mutation, and closes
 * this from its own success handler so a rejected name (a duplicate, or the
 * twenty-preset cap) leaves the typed text on screen to be corrected.
 *
 * @returns The name dialog.
 */
export function StagePresetNameDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  initialName = "",
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  /** Prefilled on rename; empty when saving a new preset. */
  initialName?: string;
  pending: boolean;
  onConfirm: (name: string) => void;
}) {
  const [name, setName] = useState(initialName);
  const trimmed = name.trim();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Reopening starts from the stored name rather than from whatever an
        // abandoned edit left behind.
        if (next) {
          setName(initialName);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <Field>
          <FieldLabel htmlFor="stage-preset-name">Name</FieldLabel>
          <Input
            id="stage-preset-name"
            value={name}
            maxLength={MAX_PRESET_NAME_LENGTH}
            placeholder="Green screen, plate off"
            onChange={(event) => setName(event.target.value)}
          />
        </Field>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => onConfirm(trimmed)} disabled={trimmed === "" || pending}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

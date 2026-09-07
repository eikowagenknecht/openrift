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

export const MAX_PRESET_NAME_LENGTH = 60;

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

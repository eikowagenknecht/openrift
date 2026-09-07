import type { Printing } from "@openrift/shared";
import { useState } from "react";

import { AlertDialog, AlertDialogContent, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DialogForm } from "@/components/ui/dialog-form";
import { QuantityStepper } from "@/components/ui/quantity-stepper";

interface TakeConfirmDialogProps {
  printing: Printing | null;
  maxQuantity: number;
  initialQuantity: number;
  isPending: boolean;
  onConfirm: (quantity: number) => void;
  onOpenChange: (open: boolean) => void;
}

export function TakeConfirmDialog({
  printing,
  maxQuantity,
  initialQuantity,
  isPending,
  onConfirm,
  onOpenChange,
}: TakeConfirmDialogProps) {
  const open = printing !== null;
  const [quantity, setQuantity] = useState(initialQuantity);

  const [armedFor, setArmedFor] = useState({ printing, initialQuantity });
  if (armedFor.printing !== printing || armedFor.initialQuantity !== initialQuantity) {
    setArmedFor({ printing, initialQuantity });
    setQuantity(initialQuantity);
  }

  const canStep = maxQuantity > 1;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <DialogForm onSubmit={() => onConfirm(quantity)}>
          <AlertDialogTitle>Take from the group collection</AlertDialogTitle>
          {canStep && (
            <div className="flex flex-col items-center gap-1 py-1">
              <QuantityStepper
                value={quantity}
                onValueChange={setQuantity}
                max={maxQuantity}
                disabled={isPending}
              />
              <p className="text-muted-foreground text-xs">{maxQuantity} in the box</p>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Taking…" : quantity === 1 ? "Take a copy" : `Take ${quantity} copies`}
            </Button>
          </div>
        </DialogForm>
      </AlertDialogContent>
    </AlertDialog>
  );
}

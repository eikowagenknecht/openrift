import type { Printing } from "@openrift/shared";
import { useEffect, useState } from "react";

import { AlertDialog, AlertDialogContent, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DialogForm } from "@/components/ui/dialog-form";
import { QuantityStepper } from "@/components/ui/quantity-stepper";

interface TakeConfirmDialogProps {
  /** The card to take, or null when the dialog is closed. */
  printing: Printing | null;
  /** How many copies of this card the group box holds (the quantity cap). */
  maxQuantity: number;
  /** Quantity the stepper opens on (1 from the Take button, N from "Take N"). */
  initialQuantity: number;
  isPending: boolean;
  onConfirm: (quantity: number) => void;
  onOpenChange: (open: boolean) => void;
}

/**
 * Confirms taking copies out of a group "bulk box" and lets the viewer choose
 * how many (1 up to what the box holds) before the move runs. Wording stays
 * neutral about what a take means socially; it only states the mechanical move.
 * @returns The take confirmation dialog.
 */
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

  // Re-arm the stepper whenever the dialog opens for a fresh take.
  useEffect(() => {
    setQuantity(initialQuantity);
  }, [initialQuantity, printing]);

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

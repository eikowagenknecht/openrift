import { useState } from "react";

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
import { QuantityStepper } from "@/components/ui/quantity-stepper";

interface ReturnLoanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Copies still out on this loan; the stepper is bounded to `1..outstanding`. */
  outstanding: number;
  /** Whether the return mutation is in flight. */
  pending: boolean;
  onConfirm: (quantity: number) => void;
}

/**
 * Quantity dialog for marking copies of a loan returned (partial returns
 * allowed, ADR-039). Defaults to everything still out.
 * @returns The dialog element.
 */
export function ReturnLoanDialog({
  open,
  onOpenChange,
  outstanding,
  pending,
  onConfirm,
}: ReturnLoanDialogProps) {
  const [quantity, setQuantity] = useState(() => Math.max(1, outstanding));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogForm onSubmit={() => onConfirm(quantity)}>
          <DialogHeader>
            <DialogTitle>Mark returned</DialogTitle>
            <DialogDescription>The loan closes once everything is returned.</DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-between gap-4 py-2">
            <span>Copies returned</span>
            <QuantityStepper
              value={quantity}
              onValueChange={setQuantity}
              max={Math.max(1, outstanding)}
              editable
            />
          </div>
          <p className="text-muted-foreground text-sm">
            {outstanding} {outstanding === 1 ? "copy is" : "copies are"} still out
          </p>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button type="submit" disabled={pending}>
              Mark returned
            </Button>
          </DialogFooter>
        </DialogForm>
      </DialogContent>
    </Dialog>
  );
}

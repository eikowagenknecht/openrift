import { MinusIcon, PlusIcon } from "lucide-react";
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
import { Input } from "@/components/ui/input";

interface ReturnLoanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cardName: string;
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
  cardName,
  outstanding,
  pending,
  onConfirm,
}: ReturnLoanDialogProps) {
  const [quantity, setQuantity] = useState(() => Math.max(1, outstanding));

  const clamp = (value: number) => Math.min(Math.max(1, value), Math.max(1, outstanding));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark returned</DialogTitle>
          <DialogDescription>
            How many copies of {cardName} did you get back? The loan closes once everything is
            returned.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-4 py-2">
          <span>Copies returned</span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Decrease quantity"
              disabled={quantity <= 1}
              onClick={() => setQuantity((current) => clamp(current - 1))}
            >
              <MinusIcon />
            </Button>
            <Input
              type="number"
              min={1}
              max={outstanding}
              value={quantity}
              aria-label="Quantity"
              // Hide the native number spinners — the +/- buttons drive the value.
              className="w-16 [appearance:textfield] text-center [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              onChange={(event) => setQuantity(clamp(Number(event.target.value)))}
            />
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Increase quantity"
              disabled={quantity >= outstanding}
              onClick={() => setQuantity((current) => clamp(current + 1))}
            >
              <PlusIcon />
            </Button>
          </div>
        </div>
        <p className="text-muted-foreground text-sm">
          {outstanding} {outstanding === 1 ? "copy is" : "copies are"} still out
        </p>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button type="button" disabled={pending} onClick={() => onConfirm(quantity)}>
            Mark returned
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

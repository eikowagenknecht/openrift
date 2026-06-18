import type { Printing } from "@openrift/shared";
import { legendDisplayName } from "@openrift/shared";
import { MinusIcon, PlusIcon } from "lucide-react";
import { useEffect, useState } from "react";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

interface TakeConfirmDialogProps {
  /** The card to take, or null when the dialog is closed. */
  printing: Printing | null;
  /** How many copies of this card the group box holds (the quantity cap). */
  maxQuantity: number;
  /** Quantity the stepper opens on (1 from the Take button, N from "Take N"). */
  initialQuantity: number;
  /** Where the copies land, for the description. */
  inboxName: string;
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
  inboxName,
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

  const cardName = printing ? legendDisplayName(printing.card) : "";
  const canStep = maxQuantity > 1;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogTitle>Take from the group collection</AlertDialogTitle>
        <AlertDialogDescription>
          {quantity === 1 ? "Move one copy" : `Move ${quantity} copies`} of {cardName} from the
          group collection into your {inboxName}.
        </AlertDialogDescription>
        {canStep && (
          <div className="flex flex-col items-center gap-1 py-1">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="icon"
                disabled={quantity <= 1 || isPending}
                onClick={() => setQuantity((current) => Math.max(1, current - 1))}
                aria-label="One fewer"
              >
                <MinusIcon className="size-4" />
              </Button>
              <span className="w-8 text-center text-lg font-medium tabular-nums">{quantity}</span>
              <Button
                variant="outline"
                size="icon"
                disabled={quantity >= maxQuantity || isPending}
                onClick={() => setQuantity((current) => Math.min(maxQuantity, current + 1))}
                aria-label="One more"
              >
                <PlusIcon className="size-4" />
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">{maxQuantity} in the box</p>
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={() => onConfirm(quantity)} disabled={isPending}>
            {isPending ? "Taking…" : quantity === 1 ? "Take a copy" : `Take ${quantity} copies`}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}

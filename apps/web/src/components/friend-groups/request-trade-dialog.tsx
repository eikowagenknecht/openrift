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
import { maxTradeQuantity } from "@/lib/trade-derivation";

interface RequestTradeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `request` = "I want this card"; `offer` = "I have this, want it?". */
  mode: "request" | "offer";
  cardName: string;
  /** Copies currently available to trade (already nets out reserved). */
  availableCount: number;
  /** The wanter's quantity, used to pre-fill the stepper. */
  demandQuantity: number;
  /** Whether the create mutation is in flight. */
  pending: boolean;
  onConfirm: (quantity: number) => void;
}

/**
 * Quantity dialog for creating a trade from a match row. The stepper is bounded
 * to `1..availableCount` and defaults to `min(demand, available)`.
 * @returns The dialog element.
 */
export function RequestTradeDialog({
  open,
  onOpenChange,
  mode,
  cardName,
  availableCount,
  demandQuantity,
  pending,
  onConfirm,
}: RequestTradeDialogProps) {
  // Capped by what the wanting side wants AND what's available — you never trade
  // more than is wanted (offering 5 when they want 1 makes no sense).
  const maxQuantity = maxTradeQuantity(demandQuantity, availableCount);
  const [quantity, setQuantity] = useState(() => Math.max(1, maxQuantity));

  const title = mode === "request" ? "Request this card" : "Offer this card";
  const verb = mode === "request" ? "Send request" : "Send offer";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogForm onSubmit={() => onConfirm(quantity)}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {mode === "request"
                ? `Ask for ${cardName}. They'll get a notification, and accepting reserves it for you.`
                : `Offer ${cardName}. They'll get a notification, and accepting reserves your copies.`}
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-between gap-4 py-2">
            <span>How many?</span>
            <QuantityStepper
              value={quantity}
              onValueChange={setQuantity}
              max={Math.max(1, maxQuantity)}
              editable
            />
          </div>
          <p className="text-muted-foreground text-sm">
            {mode === "offer"
              ? `They want ${demandQuantity}, you have ${availableCount}`
              : `You want ${demandQuantity} · ${availableCount} available`}
          </p>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button type="submit" disabled={pending || maxQuantity <= 0}>
              {verb}
            </Button>
          </DialogFooter>
        </DialogForm>
      </DialogContent>
    </Dialog>
  );
}

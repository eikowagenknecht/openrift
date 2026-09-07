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
import { maxTradeQuantity } from "@/features/groups/lib/trade-derivation";

interface RequestTradeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "request" | "offer";
  cardName: string;
  availableCount: number;
  demandQuantity: number;
  pending: boolean;
  onConfirm: (quantity: number) => void;
}

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

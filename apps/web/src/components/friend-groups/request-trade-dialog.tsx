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

  const clamp = (value: number) => Math.min(Math.max(1, value), Math.max(1, maxQuantity));
  const title = mode === "request" ? "Request this card" : "Offer this card";
  const verb = mode === "request" ? "Send request" : "Send offer";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
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
              max={maxQuantity}
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
              disabled={quantity >= maxQuantity}
              onClick={() => setQuantity((current) => clamp(current + 1))}
            >
              <PlusIcon />
            </Button>
          </div>
        </div>
        <p className="text-muted-foreground text-sm">
          {mode === "offer"
            ? `They want ${demandQuantity}, you have ${availableCount}`
            : `You want ${demandQuantity} · ${availableCount} available`}
        </p>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button
            type="button"
            disabled={pending || maxQuantity <= 0}
            onClick={() => onConfirm(quantity)}
          >
            {verb}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

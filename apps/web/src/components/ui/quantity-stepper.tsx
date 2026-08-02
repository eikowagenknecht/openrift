import { MinusIcon, PlusIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Hand-authored primitive (not shadcn-scaffolded).
//
// The "how many copies" control shared by the collection dialogs (move, remove,
// add to list, take from a group box). It is a plain controlled stepper: the
// caller owns the value and the bounds, the stepper only clamps what it hands
// back. QuantityStepper is the bare minus/value/plus cluster; QuantityStepperField
// wraps it in the bordered label row the dialogs use.

interface QuantityStepperProps {
  value: number;
  onValueChange: (value: number) => void;
  /** Upper bound, inclusive. Usually how many copies the action can touch. */
  max: number;
  /** Lower bound, inclusive. Defaults to 1 — every dialog acts on at least one copy. */
  min?: number;
  disabled?: boolean;
  className?: string;
}

/**
 * Minus / value / plus cluster for picking a small count.
 * @returns The stepper control.
 */
function QuantityStepper({
  value,
  onValueChange,
  max,
  min = 1,
  disabled = false,
  className,
}: QuantityStepperProps) {
  const step = (delta: number) => {
    onValueChange(Math.min(max, Math.max(min, value + delta)));
  };

  return (
    <div data-slot="quantity-stepper" className={cn("flex items-center gap-3", className)}>
      <Button
        variant="outline"
        size="icon"
        disabled={disabled || value <= min}
        onClick={() => step(-1)}
        aria-label="One fewer"
      >
        <MinusIcon className="size-4" />
      </Button>
      <span className="w-8 text-center text-lg font-medium tabular-nums">{value}</span>
      <Button
        variant="outline"
        size="icon"
        disabled={disabled || value >= max}
        onClick={() => step(1)}
        aria-label="One more"
      >
        <PlusIcon className="size-4" />
      </Button>
    </div>
  );
}

/**
 * The stepper as a labeled dialog row: label on the left, control on the right,
 * boxed so it reads as one field.
 * @returns The labeled stepper row.
 */
function QuantityStepperField({ label, ...props }: QuantityStepperProps & { label: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
      <span className="text-sm">{label}</span>
      <QuantityStepper {...props} />
    </div>
  );
}

export { QuantityStepper, QuantityStepperField };

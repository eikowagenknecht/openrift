import { MinusIcon, PlusIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNumericDraft } from "@/hooks/use-numeric-draft";
import { cn } from "@/lib/utils";

// Hand-authored primitive (not shadcn-scaffolded).
//
// The "how many copies" control shared by the collection dialogs (move, remove,
// add to list, take from a group box) and the trade/loan dialogs. It is a plain
// controlled stepper: the caller owns the value and the bounds, the stepper only
// clamps what it hands back. QuantityStepper is the bare minus/value/plus
// cluster; QuantityStepperField wraps it in the bordered label row the dialogs
// use.

interface QuantityStepperProps {
  value: number;
  onValueChange: (value: number) => void;
  /** Upper bound, inclusive. Usually how many copies the action can touch. */
  max: number;
  /** Lower bound, inclusive. Defaults to 1 — every dialog acts on at least one copy. */
  min?: number;
  disabled?: boolean;
  /**
   * Show the value as a typable number field rather than static text. Turn it on
   * where the upper bound can be large enough that clicking to the target is
   * tedious (lending, trade requests). The field may sit empty mid-edit; it
   * clamps back to the committed value when it loses focus.
   */
  editable?: boolean;
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
  editable = false,
  className,
}: QuantityStepperProps) {
  const clamp = (next: number) => Math.min(max, Math.max(min, next));
  const { inputProps, resetDraft } = useNumericDraft({
    display: String(value),
    onCommit: (text) => {
      // oxlint-disable-next-line unicorn/prefer-number-coercion -- lenient parse of an input value; Number() would yield NaN on trailing text
      const parsed = Number.parseInt(text, 10);
      if (!Number.isNaN(parsed)) {
        onValueChange(clamp(parsed));
      }
    },
  });

  return (
    <div data-slot="quantity-stepper" className={cn("flex items-center gap-3", className)}>
      <Button
        variant="outline"
        size="icon"
        disabled={disabled || value <= min}
        onClick={() => {
          resetDraft();
          onValueChange(clamp(value - 1));
        }}
        aria-label="One fewer"
      >
        <MinusIcon className="size-4" />
      </Button>
      {editable ? (
        <Input
          type="number"
          min={min}
          max={max}
          disabled={disabled}
          aria-label="Quantity"
          // Hide the native number spinners — the +/- buttons drive the value.
          className="w-16 [appearance:textfield] text-center [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          {...inputProps}
        />
      ) : (
        <span className="w-8 text-center text-lg font-medium tabular-nums">{value}</span>
      )}
      <Button
        variant="outline"
        size="icon"
        disabled={disabled || value >= max}
        onClick={() => {
          resetDraft();
          onValueChange(clamp(value + 1));
        }}
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

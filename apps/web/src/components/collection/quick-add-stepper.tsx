import { MinusIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface QuickAddStepperProps {
  /** The number between the buttons — owned copies in add mode, movable ones in move mode. */
  count: number;
  /** True once this session has touched the printing; paints the count as changed. */
  changed: boolean;
  /** The increment glyph — a plus when adding, an arrow when moving. */
  incrementIcon: ReactNode;
  incrementLabel: string;
  decrementLabel: string;
  onIncrement: () => void;
  onDecrement: () => void;
  incrementDisabled?: boolean;
  decrementDisabled?: boolean;
  /** Applied as onMouseDown so clicking a button leaves focus in the search input. */
  onMouseDown: (event: React.MouseEvent) => void;
}

/**
 * The -/count/+ cluster on a palette printing row. Add mode and move mode use
 * the same control with different labels, icons and counts. Selected-row
 * colours come from `group-data-[selected=true]` on the row rather than a prop,
 * so the cluster doesn't need to know which row is active. Both buttons stay
 * out of the tab order: the palette is driven from the search input, which
 * keeps focus throughout.
 * @returns The stepper cluster.
 */
export function QuickAddStepper({
  count,
  changed,
  incrementIcon,
  incrementLabel,
  decrementLabel,
  onIncrement,
  onDecrement,
  incrementDisabled,
  decrementDisabled,
  onMouseDown,
}: QuickAddStepperProps) {
  return (
    <div className="mr-1.5 ml-1 flex shrink-0 items-center gap-0.5">
      <Button
        type="button"
        tabIndex={-1}
        onMouseDown={onMouseDown}
        size="icon-xs"
        variant="ghost"
        onClick={onDecrement}
        disabled={decrementDisabled}
        aria-label={decrementLabel}
      >
        <MinusIcon />
      </Button>
      <span
        className={cn(
          "text-2xs w-5 text-center tabular-nums",
          // `group-not-data` keeps the changed colour and the selected row's
          // foreground mutually exclusive instead of tied on specificity.
          changed
            ? "group-data-[selected=true]:text-foreground group-not-data-[selected=true]:text-success"
            : "text-muted-foreground group-data-[selected=true]:text-foreground/80",
        )}
      >
        {count}
      </span>
      <Button
        type="button"
        tabIndex={-1}
        onMouseDown={onMouseDown}
        size="icon-xs"
        onClick={onIncrement}
        disabled={incrementDisabled}
        aria-label={incrementLabel}
      >
        {incrementIcon}
      </Button>
    </div>
  );
}

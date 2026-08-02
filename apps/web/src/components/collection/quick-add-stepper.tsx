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
          // The changed-green is scoped to unselected rows rather than left to
          // the cascade: `dark:text-green-400` and
          // `group-data-[selected=true]:text-accent-foreground` both compile to
          // specificity (0,2,0) — `:is(.dark *)` and
          // `:is(:where(.group)[data-selected=true] *)` each contribute one
          // class-level component, and `:where()` contributes none — so the tie
          // went to whichever Tailwind emits last, which is the dark variant.
          // A selected row's changed count therefore came out green in dark
          // mode and accent-foreground in light mode. `group-not-data` makes
          // the two rules mutually exclusive, so neither theme depends on
          // source order.
          changed
            ? "group-data-[selected=true]:text-accent-foreground group-not-data-[selected=true]:text-green-600 dark:group-not-data-[selected=true]:text-green-400"
            : "text-muted-foreground group-data-[selected=true]:text-accent-foreground/80",
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
        className="group-data-[selected=true]:bg-accent-foreground group-data-[selected=true]:text-accent group-data-[selected=true]:hover:bg-accent-foreground/80"
      >
        {incrementIcon}
      </Button>
    </div>
  );
}

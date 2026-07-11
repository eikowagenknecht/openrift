import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// Hand-authored primitive (not shadcn-scaffolded).
//
// CountPill is the compact h-5 pill used above card thumbnails and in list
// strips: owned counts, "Request"/"Requested" actions, trade-preference
// summaries. It grew out of the COUNT_PILL_BASE class constant (formerly
// components/cards/count-pill.ts). Static pills render CountPill (a span);
// clickable ones render CountPillButton, which adds hover/disabled affordances.
// Grid-coupled surfaces that need the raw classes (card-count-strip sizes
// against grid constants) can use countPillVariants directly.

const countPillVariants = cva(
  "inline-flex h-5 items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium tabular-nums transition-colors",
  {
    variants: {
      variant: {
        muted: "bg-muted text-muted-foreground",
        primary: "bg-primary/10 text-primary",
        success: "bg-green-500/10 text-green-700 dark:bg-green-500/20 dark:text-green-400",
        // Background-less pill for informational chips in the card strips —
        // the interactive form regains a muted ground on hover (see
        // countPillHover) so tappability still reads on pointer devices.
        ghost: "text-muted-foreground bg-transparent px-1",
      },
    },
    defaultVariants: {
      variant: "muted",
    },
  },
);

// Hover tints per variant for the interactive (button) form. Kept out of the
// cva so the static span form never gains a hover state.
const countPillHover: Record<NonNullable<CountPillVariant>, string> = {
  muted: "hover:bg-muted/80",
  primary: "hover:bg-primary/20",
  success: "hover:bg-green-500/20 dark:hover:bg-green-500/30",
  ghost: "hover:bg-muted/80",
};

// For call sites that put the pill classes on another primitive's trigger
// (e.g. `<PopoverTrigger className={cn(countPillVariants(), COUNT_PILL_INTERACTIVE)}>`)
// where CountPillButton can't be used. Matches the muted hover above.
export const COUNT_PILL_INTERACTIVE = "cursor-pointer hover:bg-muted/80";

type CountPillVariant = VariantProps<typeof countPillVariants>["variant"];

/**
 * Static count pill (a span).
 *
 * @returns The pill span element.
 */
function CountPill({
  variant,
  className,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof countPillVariants>) {
  return (
    <span
      data-slot="count-pill"
      className={cn(countPillVariants({ variant }), className)}
      {...props}
    />
  );
}

/**
 * Clickable count pill (a button) with per-variant hover tint; disabled pills
 * keep the pill visible but show not-allowed cursor at half opacity.
 *
 * @returns The pill button element.
 */
function CountPillButton({
  variant,
  className,
  disabled,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof countPillVariants>) {
  return (
    <button
      data-slot="count-pill"
      type="button"
      disabled={disabled}
      className={cn(
        countPillVariants({ variant }),
        "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
        disabled
          ? "cursor-not-allowed opacity-50"
          : cn("cursor-pointer", countPillHover[variant ?? "muted"]),
        className,
      )}
      {...props}
    />
  );
}

export { CountPill, CountPillButton, countPillVariants };

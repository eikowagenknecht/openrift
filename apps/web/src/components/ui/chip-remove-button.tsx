import { XIcon } from "lucide-react";

import { cn } from "@/lib/utils";

// Hand-authored primitive (not shadcn-scaffolded).
//
// ChipRemoveButton is the tiny inline icon action inside a Badge/chip — the
// "×" that clears a filter value, removes a card from a plan, or unassigns a
// printing. It defaults to an XIcon; pass children for a different icon (e.g.
// a BanIcon "disable" action). The aria-label is required: the visible content
// is icon-only, so screen readers get nothing without it.

/**
 * Tiny icon button for use inside a Badge or chip. Defaults to a size-3 XIcon;
 * pass children to swap the icon.
 *
 * @returns The chip action button element.
 */
function ChipRemoveButton({
  className,
  children,
  ...props
}: React.ComponentProps<"button"> & { "aria-label": string }) {
  return (
    <button
      data-slot="chip-remove-button"
      type="button"
      className={cn(
        "hover:text-foreground focus-visible:ring-ring ml-0.5 cursor-pointer rounded-sm focus-visible:ring-2 focus-visible:outline-none",
        className,
      )}
      {...props}
    >
      {children ?? <XIcon className="size-3" />}
    </button>
  );
}

export { ChipRemoveButton };

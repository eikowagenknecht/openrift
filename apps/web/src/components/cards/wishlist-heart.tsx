import type { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { Link } from "@tanstack/react-router";
import { HeartIcon } from "lucide-react";

import { COUNT_PILL_INTERACTIVE, countPillVariants } from "@/components/ui/count-pill";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { WishEntryFlat } from "@/hooks/use-wish-entries";
import { cn } from "@/lib/utils";

/**
 * Wishlist marker shown in a card's count strip — on a group "bulk box" tile and
 * on a member's tradelist. Styled like the count pill (same muted background +
 * hover) with a red heart, and shows the total wished quantity (N) when the
 * viewer wants more than one. Clicking opens a popover listing every wish list
 * the card sits on (mirroring the owned-count popover), each linking to its list.
 * @returns The wishlist heart popover, or null when the card is on no wish list.
 */
export function WishlistHeart({
  entries,
  align = "start",
}: {
  /** The viewer's wish entries matching this card (from `entriesForPrinting`). */
  entries: readonly WishEntryFlat[];
  /** Horizontal alignment of the popover relative to the trigger. */
  align?: PopoverPrimitive.Positioner.Props["align"];
}) {
  if (entries.length === 0) {
    return null;
  }
  const totalQuantity = entries.reduce((sum, entry) => sum + entry.quantity, 0);
  const listLabel = entries.length > 1 ? "wishlists" : "wishlist";
  return (
    <Popover>
      <PopoverTrigger
        onClick={(event) => event.stopPropagation()}
        tabIndex={-1}
        className={cn(countPillVariants({ variant: "ghost" }), COUNT_PILL_INTERACTIVE, "gap-0.5")}
        title={
          totalQuantity > 1 ? `On your ${listLabel} (${totalQuantity})` : `On your ${listLabel}`
        }
      >
        <HeartIcon className="size-3 fill-current text-rose-500" />
        {totalQuantity > 1 && <span>{totalQuantity}</span>}
        <span className="sr-only">
          On your {listLabel}
          {totalQuantity > 1 ? `, ${totalQuantity} wanted` : ""}
        </span>
      </PopoverTrigger>
      <PopoverContent side="bottom" align={align} className="w-60 p-0">
        <div className="px-3 pt-2.5 pb-1">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            On your {listLabel}
          </p>
        </div>
        <ul className="px-1 pb-1">
          {entries.map((entry) => (
            <li key={entry.entryId}>
              <Link
                to="/collections/lists/$listId"
                params={{ listId: entry.listId }}
                className={cn(
                  "flex items-center justify-between rounded-md px-2 py-1.5 text-sm",
                  "hover:bg-accent transition-colors",
                )}
              >
                <span className="truncate">{entry.listName}</span>
                <span className="text-muted-foreground ml-2 shrink-0 tabular-nums">
                  &times;{entry.quantity}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

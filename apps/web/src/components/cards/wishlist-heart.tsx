import type { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { Link } from "@tanstack/react-router";
import { HeartIcon, HeartPlusIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { COUNT_PILL_INTERACTIVE, countPillVariants } from "@/components/ui/count-pill";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SectionHeading } from "@/components/ui/section-heading";
import type { WishEntryFlat } from "@/hooks/use-wish-entries";
import { cn } from "@/lib/utils";

/**
 * Wishlist marker shown in a card's count strip — on a group "bulk box" tile and
 * on a member's tradelist. Styled like the count pill (same muted background +
 * hover) with a red heart, and shows the total wished quantity (N) when the
 * viewer wants more than one. Clicking opens a popover listing every wish list
 * the card sits on (mirroring the owned-count popover), each linking to its list.
 *
 * Read-only unless the surface passes `onAdd` / `onRemove`, which turn the
 * popover into the card's wishlist editor. {@link WishlistButton} is the
 * variant to reach for when the card may not be wished yet.
 * @returns The wishlist heart popover, or null when the card is on no wish list.
 */
export function WishlistHeart({
  entries,
  align = "start",
  onAdd,
  onRemove,
}: {
  /** The viewer's wish entries matching this card (from `entriesForPrinting`). */
  entries: readonly WishEntryFlat[];
  /** Horizontal alignment of the popover relative to the trigger. */
  align?: PopoverPrimitive.Positioner.Props["align"];
  /** Offer "Add to another wishlist" in the popover footer. */
  onAdd?: () => void;
  /** Offer a per-row remove. Receives the entry the row stands for. */
  onRemove?: (entry: WishEntryFlat) => void;
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
        <HeartIcon className="text-destructive size-3 fill-current" />
        {totalQuantity > 1 && <span>{totalQuantity}</span>}
        <span className="sr-only">
          On your {listLabel}
          {totalQuantity > 1 ? `, ${totalQuantity} wanted` : ""}
        </span>
      </PopoverTrigger>
      <PopoverContent side="bottom" align={align} className="w-60 p-0">
        <div className="px-3 pt-2.5 pb-1">
          <SectionHeading as="h3">On your {listLabel}</SectionHeading>
        </div>
        <ul className="px-1 pb-1">
          {entries.map((entry) => (
            <li
              key={entry.entryId}
              className="hover:bg-muted relative flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors"
            >
              {/* Stretched link so the row is clickable without nesting the
                remove button inside an anchor. */}
              <Link
                to="/collections/lists/$listId"
                params={{ listId: entry.listId }}
                className="absolute inset-0 rounded-md"
                aria-label={`Open ${entry.listName}`}
              />
              <span className="truncate">{entry.listName}</span>
              <span className="text-muted-foreground ml-auto shrink-0 tabular-nums">
                &times;{entry.quantity}
              </span>
              {onRemove && (
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  className="relative shrink-0"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemove(entry);
                  }}
                  aria-label={`Remove from ${entry.listName}`}
                  title={`Remove from ${entry.listName}`}
                >
                  <XIcon />
                </Button>
              )}
            </li>
          ))}
        </ul>
        {onAdd && (
          <div className="border-t p-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground w-full justify-start"
              onClick={(event) => {
                event.stopPropagation();
                onAdd();
              }}
            >
              <HeartPlusIcon className="size-3.5" />
              Add to another wishlist
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

/**
 * The wishlist affordance for a card that may not be wished yet: a hollow heart
 * that opens the wishlist picker, becoming the filled {@link WishlistHeart} and
 * its popover once the card is on a list.
 *
 * Kept separate from the heart because the read-only surfaces (group bulk box,
 * a member's tradelist) want a marker that disappears when there is nothing to
 * mark, while a browse surface wants a control that is always there.
 * @returns The wishlist button.
 */
export function WishlistButton({
  entries,
  cardName,
  onAdd,
  onRemove,
  align = "start",
}: {
  entries: readonly WishEntryFlat[];
  /** Named in the button's label, which is the only thing a screen reader gets. */
  cardName: string;
  onAdd: () => void;
  onRemove?: (entry: WishEntryFlat) => void;
  align?: PopoverPrimitive.Positioner.Props["align"];
}) {
  if (entries.length > 0) {
    return <WishlistHeart entries={entries} align={align} onAdd={onAdd} onRemove={onRemove} />;
  }
  return (
    <Button
      type="button"
      tabIndex={-1}
      size="icon-xs"
      variant="ghost"
      className="text-muted-foreground hover:text-destructive"
      onClick={(event) => {
        event.stopPropagation();
        onAdd();
      }}
      aria-label={`Add ${cardName} to a wishlist`}
      title="Add to a wishlist"
    >
      <HeartIcon />
    </Button>
  );
}

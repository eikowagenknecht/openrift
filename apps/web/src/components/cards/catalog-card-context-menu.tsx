import type { Printing } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { ExternalLinkIcon, HeartPlusIcon, PackagePlusIcon } from "lucide-react";
import type { ReactNode } from "react";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { dispatchAddToWishlist, dispatchIncrement } from "@/stores/card-row-actions-store";

interface CatalogCardContextMenuProps {
  /** The cell's displayed printing, sibling swaps included. */
  printing: Printing;
  /** Offer the add-a-copy shortcut. Off when the browser has no add target. */
  canAdd: boolean;
  /** Offer the wishlist picker. Off for signed-out visitors. */
  canWish: boolean;
  /** Name of the collection an add lands in, for the item's label. */
  addTargetName: string;
  children?: ReactNode;
}

/**
 * Right-click / long-press menu on a catalog card. It is the always-available
 * home for the two things a browsing viewer wants to record — "I have this" and
 * "I want this" — because the count strip they also live on is hidden whenever
 * the owned-count toggle is off.
 * @returns The card wrapped with its context menu.
 */
export function CatalogCardContextMenu({
  printing,
  canAdd,
  canWish,
  addTargetName,
  children,
}: CatalogCardContextMenuProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger
        className="block select-none [-webkit-touch-callout:none]"
        render={<div />}
      >
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        {canAdd && (
          <ContextMenuItem
            onClick={(event) => {
              event.stopPropagation();
              dispatchIncrement(printing);
            }}
          >
            <PackagePlusIcon />
            Add to {addTargetName}
          </ContextMenuItem>
        )}
        {canWish && (
          <ContextMenuItem
            onClick={(event) => {
              event.stopPropagation();
              dispatchAddToWishlist(printing);
            }}
          >
            <HeartPlusIcon />
            Add to wishlist…
          </ContextMenuItem>
        )}
        {(canAdd || canWish) && <ContextMenuSeparator />}
        <ContextMenuItem
          render={<Link to="/cards/$cardSlug" params={{ cardSlug: printing.card.slug }} />}
        >
          <ExternalLinkIcon />
          Open card page
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

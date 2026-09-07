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
  printing: Printing;
  canAdd: boolean;
  canWish: boolean;
  addTargetName: string;
  children?: ReactNode;
}

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

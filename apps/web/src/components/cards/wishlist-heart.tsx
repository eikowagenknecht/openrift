import { HeartIcon } from "lucide-react";
import type { MouseEvent as ReactMouseEvent } from "react";

import { COUNT_PILL_BASE, COUNT_PILL_INTERACTIVE } from "@/components/cards/count-pill";
import { cn } from "@/lib/utils";

/**
 * Wishlist marker shown in a card's count strip — on a group "bulk box" tile and
 * on a member's tradelist. Styled like the count pill (same muted background +
 * hover) with a red heart, and shows the wished quantity (×N) when the viewer
 * wants more than one. Opens the wish list it's on when clicked.
 * @returns The wishlist heart button.
 */
export function WishlistHeart({
  quantity,
  onClick,
}: {
  quantity: number;
  onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      tabIndex={-1}
      onClick={onClick}
      className={cn(COUNT_PILL_BASE, COUNT_PILL_INTERACTIVE, "gap-0.5 px-1.5")}
      title={
        quantity > 1 ? `On your wishlist (×${quantity}), open it` : "On your wishlist, open it"
      }
    >
      <HeartIcon className="size-3 fill-current text-rose-500" />
      {quantity > 1 && <span>×{quantity}</span>}
      <span className="sr-only">
        On your wishlist{quantity > 1 ? `, ${quantity} wanted` : ""}, open it
      </span>
    </button>
  );
}

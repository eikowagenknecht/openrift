import type { Card } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { ExternalLinkIcon, PencilLineIcon, ShieldIcon } from "lucide-react";

import { useIsAdmin } from "@/hooks/use-admin";

/**
 * Escape hatches out of the overlay: the card's own page, the correction form,
 * and the admin view for admins. Not rendered on the standalone card page,
 * which is already there and carries its own top-bar links.
 *
 * "Open card page" rather than "View card details" — the reader is already
 * looking at the card's details, so the old label named the thing they had.
 * @returns The link row.
 */
export function CardDetailLinks({ card }: { card: Card }) {
  const { data: isAdmin } = useIsAdmin();

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <Link
        to="/cards/$cardSlug"
        params={{ cardSlug: card.slug }}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
      >
        <ExternalLinkIcon className="size-3" />
        Open card page
      </Link>
      <Link
        to="/contribute/$cardSlug"
        params={{ cardSlug: card.slug }}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
      >
        <PencilLineIcon className="size-3" />
        Suggest a correction
      </Link>
      {isAdmin && (
        <Link
          to="/admin/cards/$cardSlug"
          params={{ cardSlug: card.slug }}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
        >
          <ShieldIcon className="size-3" />
          Admin view
        </Link>
      )}
    </div>
  );
}

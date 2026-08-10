import type { Card } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { ExternalLinkIcon, ShieldIcon } from "lucide-react";

import { useIsAdmin } from "@/hooks/use-admin";

/**
 * Escape hatches out of the overlay: the card's own page, and the admin view
 * for admins. Not rendered on the standalone card page, which is already there.
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
        View card details
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

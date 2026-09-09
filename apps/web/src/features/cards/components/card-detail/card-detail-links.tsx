import type { Card, Printing } from "@openrift/shared/types/catalog";
import { Link } from "@tanstack/react-router";
import { ExternalLinkIcon, LayersIcon, PencilLineIcon, ShieldIcon } from "lucide-react";

import { useIsAdmin } from "@/features/admin/hooks/use-admin";

/**
 * Escape hatches out of the overlay: the card's own page, the correction form,
 * and the admin view for admins. Not rendered on the standalone card page,
 * which already carries its own top-bar links.
 */
export function CardDetailLinks({ card, printing }: { card: Card; printing?: Printing }) {
  const { data: isAdmin } = useIsAdmin();

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <Link
        to="/cards/$cardSlug/{-$printingSlug}"
        params={{ cardSlug: card.slug }}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
      >
        <ExternalLinkIcon className="size-3" />
        Open card page
      </Link>
      <Link
        to="/contribute/card/$cardSlug"
        params={{ cardSlug: card.slug }}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
      >
        <PencilLineIcon className="size-3" />
        Suggest a correction
      </Link>
      {printing && (
        <Link
          to="/contribute/card/$cardSlug/printing/$printingId"
          params={{ cardSlug: card.slug, printingId: printing.id }}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
        >
          <LayersIcon className="size-3" />
          Fix this printing
        </Link>
      )}
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

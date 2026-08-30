import type { MetaEventSummary } from "@openrift/shared";
import { dateLeafPartsUtc } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { ChevronRightIcon } from "lucide-react";

import { MetaTierBadge } from "@/components/meta/meta-tier-badge";
import { CountryFlag } from "@/components/ui/country-flag";
import { DateLeaf } from "@/components/ui/date-leaf";
import { metaEventCounts } from "@/lib/meta-format";

/**
 * One archived event as a list row: when, what, where, and how much of it the
 * archive holds. Built to sit inside a shared card with its siblings, so it
 * carries a hover wash rather than a ring of its own.
 */
export function MetaEventRow({ event }: { event: MetaEventSummary }) {
  const leaf = dateLeafPartsUtc(event.eventDate);
  const venue = [event.organizer, event.location].filter(Boolean).join(" · ");
  const counts = metaEventCounts(event.playerRowCount, event.deckCount);

  return (
    <Link
      to="/meta/$slug"
      params={{ slug: event.slug }}
      className="hover:bg-muted/40 focus-visible:ring-ring/50 flex items-center gap-3 px-4 py-2.5 outline-none focus-visible:ring-2 focus-visible:-outline-offset-2"
    >
      <DateLeaf month={leaf.month} day={leaf.day} size="sm" />

      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-semibold">{event.name}</span>
        <span className="text-muted-foreground truncate text-xs">{venue}</span>
        {/* On a phone the tier and country cannot hold their own columns, so
            they ride under the name instead of squeezing the title to nothing. */}
        <span className="mt-1 flex items-center gap-2 sm:hidden">
          <MetaTierBadge tier={event.tier} />
          <CountryFlag code={event.country} size="sm" />
          <span className="text-muted-foreground truncate text-xs tabular-nums">
            {counts.join(" · ")}
          </span>
        </span>
      </span>

      <span className="hidden shrink-0 items-center gap-4 sm:flex">
        <MetaTierBadge tier={event.tier} />
        <CountryFlag code={event.country} size="sm" className="w-14" />
        <span className="text-muted-foreground w-40 text-right text-xs tabular-nums">
          {counts.join(" · ")}
        </span>
      </span>

      <ChevronRightIcon aria-hidden className="text-muted-foreground size-4 shrink-0" />
    </Link>
  );
}

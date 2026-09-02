import type { MetaEventSummary } from "@openrift/shared";
import { dateLeafPartsUtc } from "@openrift/shared";
import { Link } from "@tanstack/react-router";

import { MetaTierBadge } from "@/components/meta/meta-tier-badge";
import { CountryFlag } from "@/components/ui/country-flag";
import { DateLeaf } from "@/components/ui/date-leaf";

export function MetaUpcomingRow({ event }: { event: MetaEventSummary }) {
  const leaf = dateLeafPartsUtc(event.eventDate);

  return (
    <Link
      to="/meta/$slug"
      params={{ slug: event.slug }}
      className="hover:bg-muted/40 focus-visible:ring-ring/50 flex items-center gap-2.5 px-3 py-2 outline-none focus-visible:ring-2 focus-visible:-outline-offset-2"
    >
      <DateLeaf month={leaf.month} day={leaf.day} size="sm" />

      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-semibold">{event.name}</span>
        <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <MetaTierBadge tier={event.tier} />
          <CountryFlag code={event.country} size="sm" />
          {event.playerCount !== null && (
            <span className="tabular-nums">
              {event.playerCount.toLocaleString("en-US")} registered
            </span>
          )}
        </span>
      </span>
    </Link>
  );
}

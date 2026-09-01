import type { MetaEventSummary } from "@openrift/shared";
import { dateLeafPartsUtc } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { ChevronRightIcon } from "lucide-react";

import { CountryFlag } from "@/components/ui/country-flag";
import { DateLeaf } from "@/components/ui/date-leaf";
import { Medal } from "@/components/ui/podium";
import { joinNames, metaEventCounts, splitLegendName } from "@/lib/meta-format";
import { metaEventWinners } from "@/lib/meta-front-page";

/**
 * The winner as one inline run: names first, the champion the (single) winner
 * played after them. A tie prints every name and drops the champion — two
 * winners means two decks, and picking one champion to stand for the row would
 * print a fact nobody published.
 */
function WinnerInline({ event }: { event: MetaEventSummary }) {
  const winners = metaEventWinners(event);
  if (winners.length === 0) {
    return null;
  }
  const names = joinNames(winners.map((winner) => winner.playerName));
  const champion =
    winners.length === 1 && winners[0].legend !== null
      ? splitLegendName(winners[0].legend.name).champion
      : null;

  return (
    <span className="flex min-w-0 items-center gap-2">
      <Medal rank={1} />
      <span className="min-w-0 truncate">
        <span className="font-medium">{names}</span>
        {champion !== null && <span className="text-muted-foreground text-xs"> on {champion}</span>}
      </span>
    </span>
  );
}

/**
 * One archived event as a compact list row: when, what, where, who won, and how
 * much of it the archive holds. The row sits inside a tier section, so the tier
 * itself is not repeated here. Built to sit inside a shared card with its
 * siblings, so it carries a hover wash rather than a ring of its own.
 */
export function MetaEventRow({ event }: { event: MetaEventSummary }) {
  const leaf = dateLeafPartsUtc(event.eventDate);
  const venue = [event.organizer, event.location].filter(Boolean).join(" · ");
  const counts = metaEventCounts(event);

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
        {/* On a phone the winner and country cannot hold their own columns, so
            they ride under the name instead of squeezing the title to nothing. */}
        <span className="mt-1 flex items-center gap-2 sm:hidden">
          <WinnerInline event={event} />
          <CountryFlag code={event.country} size="sm" />
          <span className="text-muted-foreground truncate text-xs tabular-nums">
            {counts.join(" · ")}
          </span>
        </span>
      </span>

      <span className="hidden shrink-0 items-center gap-4 sm:flex">
        <span className="w-56 min-w-0">
          <WinnerInline event={event} />
        </span>
        {/* The slot holds its width with no flag in it, or an event whose venue
            no source named would pull the counts column out of line. */}
        <span className="w-14">
          <CountryFlag code={event.country} size="sm" />
        </span>
        <span className="text-muted-foreground w-44 text-right text-xs tabular-nums">
          {counts.join(" · ")}
        </span>
      </span>

      <ChevronRightIcon aria-hidden className="text-muted-foreground size-4 shrink-0" />
    </Link>
  );
}

import type { MetaEventFinish, MetaEventSummary } from "@openrift/shared";
import { dateLeafPartsUtc } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { ChevronRightIcon } from "lucide-react";

import { CardArtThumb } from "@/components/cards/card-art-thumb";
import { MetaIdentity } from "@/components/meta/meta-identity";
import { CountryFlag } from "@/components/ui/country-flag";
import { DateLeaf } from "@/components/ui/date-leaf";
import { Medal } from "@/components/ui/podium";
import { formatRecord, metaEventCounts } from "@/lib/meta-format";
import { metaEventWinners } from "@/lib/meta-front-page";
import { cn } from "@/lib/utils";

/** Full width by design: a caller placing content beside the standings below must not squeeze this. */
export function MetaEventHeading({ event }: { event: MetaEventSummary }) {
  const leaf = dateLeafPartsUtc(event.eventDate);
  const venue = [event.organizer, event.location].filter(Boolean).join(" · ");
  const counts = metaEventCounts(event);

  return (
    <span className="flex items-center gap-3">
      <DateLeaf month={leaf.month} day={leaf.day} size="sm" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-semibold">{event.name}</span>
        <span className="text-muted-foreground truncate text-xs">{venue}</span>
        <span className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-xs">
          <CountryFlag code={event.country} size="sm" />
          <span className="truncate tabular-nums">{counts.join(" · ")}</span>
        </span>
      </span>
      <ChevronRightIcon aria-hidden className="text-muted-foreground size-4 shrink-0" />
    </span>
  );
}

/** No winner-row fill: the crown and bold name already mark it, and a fill would look like hover. */
export function MetaFinishRow({
  finish,
  showArt = false,
}: {
  finish: MetaEventFinish;
  showArt?: boolean;
}) {
  const record = formatRecord(finish.wins, finish.losses, finish.draws);

  return (
    <span className="flex items-center gap-2.5 rounded-md px-2.5 py-1">
      <Medal rank={finish.rank} />
      {showArt && (
        <CardArtThumb
          imageId={finish.legend?.imageId ?? null}
          domains={finish.legend?.domains}
          loading="lazy"
          className="h-12"
        />
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cn("truncate", finish.rank === 1 ? "font-semibold" : "font-medium")}>
          {finish.playerName}
        </span>
        <MetaIdentity
          name={finish.legend?.name}
          domains={finish.legend?.domains}
          className="text-sm"
        />
      </span>
      {record !== null && (
        <span className="text-muted-foreground ml-auto shrink-0 text-xs tabular-nums">
          {record}
        </span>
      )}
    </span>
  );
}

/**
 * A tie prints one row per winner: picking a single one to stand for a shared
 * win would print a fact nobody published.
 */
export function MetaEventRow({ event }: { event: MetaEventSummary }) {
  const winners = metaEventWinners(event);

  return (
    <Link
      to="/meta/$slug"
      params={{ slug: event.slug }}
      className="hover:bg-muted/50 focus-visible:ring-ring/50 flex flex-col gap-1.5 px-4 py-2.5 outline-none focus-visible:ring-2 focus-visible:-outline-offset-2"
    >
      <MetaEventHeading event={event} />
      {winners.length > 0 && (
        <span className="flex flex-col gap-0.5 sm:pl-12">
          {winners.map((finish, index) => (
            <MetaFinishRow key={`${finish.rank}-${finish.playerName}-${index}`} finish={finish} />
          ))}
        </span>
      )}
    </Link>
  );
}

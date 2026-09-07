import type { MetaEventFinish, MetaEventSummary } from "@openrift/shared";
import { dateLeafPartsUtc, formatDay } from "@openrift/shared";
import { Link } from "@tanstack/react-router";

import { CardArtThumb } from "@/components/cards/card-art-thumb";
import { MetaTierBadge } from "@/components/meta/meta-tier-badge";
import { CountryFlag } from "@/components/ui/country-flag";
import { DateLeaf } from "@/components/ui/date-leaf";
import {
  formatRecord,
  joinNames,
  metaEventCounts,
  metaEventEmptyStatus,
  splitLegendName,
} from "@/lib/meta-format";
import { metaEventWinners } from "@/lib/meta-front-page";
import { cn } from "@/lib/utils";

/** Shared with the sort header above so the two grids can never drift apart. */
export const EVENT_INDEX_GRID =
  "grid grid-cols-[2.75rem_minmax(0,1fr)_6rem_3.75rem_4.5rem_3.5rem_10rem] items-center gap-x-3.5";

/** Both layouts share one Link, so an event stays one click target and tab stop at every width. */
export function MetaEventIndexRow({ event }: { event: MetaEventSummary }) {
  const leaf = dateLeafPartsUtc(event.eventDate);
  const venue = [event.organizer, event.location].filter(Boolean).join(" · ");
  const counts = metaEventCounts(event);
  const winners = metaEventWinners(event);
  const emptyStatus = metaEventEmptyStatus(event);

  return (
    <Link
      to="/meta/$slug"
      params={{ slug: event.slug }}
      className="hover:bg-muted/50 focus-visible:ring-ring/50 block px-4 py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-inset"
    >
      <span className="sr-only">{formatDay(event.eventDate)}</span>

      <div className={cn(EVENT_INDEX_GRID, "hidden sm:grid")}>
        <span aria-hidden className="contents">
          <DateLeaf month={leaf.month} day={leaf.day} year={leaf.year} size="sm" />
        </span>
        <div className="min-w-0">
          <p className="truncate font-medium">{event.name}</p>
          {venue !== "" && <p className="text-muted-foreground truncate text-xs">{venue}</p>}
        </div>
        <div>
          <MetaTierBadge tier={event.tier} />
        </div>
        {/* The slot always renders, flag or not: each child of the grid takes
            the next track, so a missing flag would shift every later column. */}
        <span>
          <CountryFlag code={event.country} size="sm" />
        </span>
        {emptyStatus === null ? (
          <>
            <span className="text-muted-foreground text-right text-sm tabular-nums">
              {event.playerRowCount}
            </span>
            <span className="text-muted-foreground text-right text-sm tabular-nums">
              {event.deckCount}
            </span>
            <WinnerCell winners={winners} />
          </>
        ) : (
          <span className="text-muted-foreground/60 col-span-3 text-sm">{emptyStatus}</span>
        )}
      </div>

      <div className="flex items-start gap-3 sm:hidden">
        <span aria-hidden className="contents">
          <DateLeaf
            month={leaf.month}
            day={leaf.day}
            year={leaf.year}
            size="sm"
            className="mt-0.5"
          />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="min-w-0">
            <p className="font-medium">{event.name}</p>
            {venue !== "" && <p className="text-muted-foreground truncate text-xs">{venue}</p>}
          </div>
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <MetaTierBadge tier={event.tier} />
            <CountryFlag code={event.country} size="sm" />
            <span className="tabular-nums">{counts.join(" · ")}</span>
          </div>
          <WinnerLine winners={winners} />
        </div>
      </div>
    </Link>
  );
}

function WinnerCell({ winners }: { winners: readonly MetaEventFinish[] }) {
  if (winners.length === 0) {
    return (
      <span aria-hidden className="text-muted-foreground/60 text-sm">
        &mdash;
      </span>
    );
  }
  return (
    <span className="flex min-w-0 items-center gap-2">
      <LegendThumbs winners={winners} />
      <span className="truncate text-sm">
        {joinNames(winners.map((winner) => winner.playerName))}
      </span>
    </span>
  );
}

function WinnerLine({ winners }: { winners: readonly MetaEventFinish[] }) {
  if (winners.length === 0) {
    return null;
  }
  const only = winners.length === 1 ? winners.at(0) : undefined;
  const record = only === undefined ? null : formatRecord(only.wins, only.losses, only.draws);
  return (
    <span className="flex min-w-0 items-center gap-2 text-sm">
      <LegendThumbs winners={winners} />
      <span className="truncate">
        Won by{" "}
        <span className="font-medium">{joinNames(winners.map((winner) => winner.playerName))}</span>
      </span>
      {record !== null && (
        <span className="text-muted-foreground shrink-0 tabular-nums">{record}</span>
      )}
    </span>
  );
}

function LegendThumbs({ winners }: { winners: readonly MetaEventFinish[] }) {
  const first = winners.at(0);
  if (winners.length === 1 && first) {
    return <LegendThumb winner={first} />;
  }
  return (
    <span className="flex shrink-0 items-center -space-x-2">
      {winners.map((winner, index) => (
        <LegendThumb key={`${winner.playerName}-${String(index)}`} winner={winner} />
      ))}
    </span>
  );
}

function LegendThumb({ winner }: { winner: MetaEventFinish }) {
  const champion = winner.legend === null ? "" : splitLegendName(winner.legend.name).champion;
  return (
    <CardArtThumb
      shape="square"
      imageId={winner.legend?.imageId ?? null}
      domains={winner.legend?.domains}
      alt={champion}
      loading="lazy"
      className="rounded-xs"
    />
  );
}

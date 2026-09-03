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

/**
 * The desktop column track, shared by the rows and the sort header above them so
 * the two can never drift apart.
 */
export const EVENT_INDEX_GRID =
  "grid grid-cols-[2.75rem_minmax(0,1fr)_6rem_3.75rem_4.5rem_3.5rem_10rem] items-center gap-x-3.5";

/**
 * One archived event, in the two arrangements the index needs: a column row from
 * `sm` up, and a card row on phones. Both live in the same link, so an event is
 * one click target and one entry in the tab order at every width.
 */
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
          // Nothing archived is one fact: one muted line where three empty
          // cells ("0 · 0 · —") would each restate it.
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

/** The winner column: the legend they played, then who they are. */
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

/**
 * The same fact on a phone, where the row has the width for the record too. The
 * record is only shown for a single winner: two records side by side stop
 * reading as "who won" and start reading as a standings table.
 */
function WinnerLine({ winners }: { winners: readonly MetaEventFinish[] }) {
  if (winners.length === 0) {
    return null;
  }
  const only = winners.length === 1 ? winners[0] : null;
  const record = only === null ? null : formatRecord(only.wins, only.losses, only.draws);
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

/** One thumbnail per winner, overlapped so a tie still fits the column. */
function LegendThumbs({ winners }: { winners: readonly MetaEventFinish[] }) {
  if (winners.length === 1) {
    return <LegendThumb winner={winners[0]} />;
  }
  return (
    <span className="flex shrink-0 items-center -space-x-2">
      {winners.map((winner, index) => (
        <LegendThumb key={`${winner.playerName}-${String(index)}`} winner={winner} />
      ))}
    </span>
  );
}

/**
 * The winner's legend at thumbnail size. Cropped to the art rather than the whole
 * card: at 24px a full card is a smudge, while the splash still reads.
 */
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

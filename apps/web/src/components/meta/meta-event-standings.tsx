import type { MetaEventPlayer } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { Heading } from "@/components/heading";
import { MetaIdentity } from "@/components/meta/meta-identity";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import { Medal } from "@/components/ui/podium";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useUserId } from "@/lib/auth-session";
import { formatRank, formatRecord, MEDAL_RANKS } from "@/lib/meta-format";
import { metaSubmitSearchForPlayer } from "@/lib/meta-submit-link";

/**
 * How much of a large field opens with the page. A real premier event runs into
 * the hundreds of rows, and every one of them below the cut is scrolled past on
 * the way to nothing.
 */
const ROWS_SHOWN = 16;

function Rank({ player }: { player: MetaEventPlayer }) {
  if (player.rank <= MEDAL_RANKS) {
    return <Medal rank={player.rank} />;
  }
  return (
    <span className="text-muted-foreground inline-block w-5 text-center tabular-nums">
      {formatRank(player.rank, player.rankIsTier)}
    </span>
  );
}

/**
 * What a row offers about its decklist: the page when the archive holds one, and
 * otherwise the way to send it. A signed-out reader gets neither — the form is
 * behind a login, and "+ Add" on every one of 588 rows would be 588 dead ends.
 */
function ListLink({
  player,
  slug,
  canSubmit,
}: {
  player: MetaEventPlayer;
  slug: string;
  canSubmit: boolean;
}) {
  if (player.shareToken !== null) {
    return (
      <Link
        to="/meta/decks/$token"
        params={{ token: player.shareToken }}
        className="text-primary font-medium whitespace-nowrap hover:underline"
      >
        {player.listStatus === "partial" ? "Partial" : "Decklist"}
      </Link>
    );
  }
  if (!canSubmit) {
    return null;
  }
  return (
    <Link
      to="/meta/$slug/submit"
      params={{ slug }}
      search={metaSubmitSearchForPlayer(player)}
      className="text-primary font-medium whitespace-nowrap hover:underline"
    >
      + Add
    </Link>
  );
}

function DesktopRow({
  player,
  slug,
  canSubmit,
}: {
  player: MetaEventPlayer;
  slug: string;
  canSubmit: boolean;
}) {
  const record = formatRecord(player.wins, player.losses, player.draws);

  return (
    <TableRow>
      <TableCell>
        <Rank player={player} />
      </TableCell>
      <TableCell className="font-medium">{player.playerName}</TableCell>
      <TableCell className="text-right tabular-nums">{record}</TableCell>
      <TableCell>
        <MetaIdentity
          name={player.legend?.name}
          slug={player.legend?.slug}
          archiveSlug={player.legend?.archiveSlug}
          domains={player.legend?.domains}
          layout="stacked"
        />
      </TableCell>
      <TableCell className="text-right">
        <ListLink player={player} slug={slug} canSubmit={canSubmit} />
      </TableCell>
    </TableRow>
  );
}

function PhoneRow({
  player,
  slug,
  canSubmit,
}: {
  player: MetaEventPlayer;
  slug: string;
  canSubmit: boolean;
}) {
  const record = formatRecord(player.wins, player.losses, player.draws);

  return (
    <li className="flex items-center gap-2.5 px-3 py-2 text-sm not-last:border-b">
      <Rank player={player} />
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate font-medium">{player.playerName}</p>
        {/* The row itself is not a link, so the legend keeps its own. */}
        <MetaIdentity
          name={player.legend?.name}
          slug={player.legend?.slug}
          archiveSlug={player.legend?.archiveSlug}
          domains={player.legend?.domains}
          className="text-muted-foreground text-xs"
        />
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5 leading-tight">
        {record !== null && <span className="tabular-nums">{record}</span>}
        <span className="text-xs">
          <ListLink player={player} slug={slug} canSubmit={canSubmit} />
        </span>
      </div>
    </li>
  );
}

/**
 * The whole field, best finish first: the tier of the archive that covers every
 * player, not only the ones whose decklist the organizer published (ADR-014).
 * The archive knows the legend for nearly every entry, so this is where a reader
 * sees what the room was actually playing.
 *
 * A table on desktop and two-line rows on phones. The five facts a row carries
 * do not survive being squeezed into phone-width columns, and the legend is the
 * first thing a narrow table drops — which is the column worth keeping.
 */
export function MetaEventStandings({
  players,
  slug,
}: {
  players: readonly MetaEventPlayer[];
  slug: string;
}) {
  const canSubmit = useUserId() !== null;
  const [expanded, setExpanded] = useState(false);

  if (players.length === 0) {
    return (
      <section className="mt-8">
        <Heading className="mb-3">Standings</Heading>
        <Empty>
          <EmptyHeader>
            <EmptyDescription>
              The results for this event have not come through yet. Check back soon.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </section>
    );
  }

  const shown = expanded ? players : players.slice(0, ROWS_SHOWN);
  const hidden = players.length - shown.length;

  return (
    <section className="mt-8">
      <Heading className="mb-3">Standings</Heading>

      <div className="bg-card ring-foreground/10 overflow-hidden rounded-lg ring-1">
        <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Rank</TableHead>
                <TableHead>Player</TableHead>
                <TableHead className="w-24 text-right">Record</TableHead>
                <TableHead className="w-56">Legend</TableHead>
                <TableHead className="w-24 text-right">Decklist</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((player) => (
                <DesktopRow key={player.id} player={player} slug={slug} canSubmit={canSubmit} />
              ))}
            </TableBody>
          </Table>
        </div>

        <ul className="flex flex-col md:hidden">
          {shown.map((player) => (
            <PhoneRow key={player.id} player={player} slug={slug} canSubmit={canSubmit} />
          ))}
        </ul>

        {(hidden > 0 || expanded) && (
          <div className="border-t">
            <Button
              variant="ghost"
              className="w-full rounded-none"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? "Show fewer" : `Show all ${players.length} entries`}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

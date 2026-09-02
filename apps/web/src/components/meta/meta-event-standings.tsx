import type { MetaEventPlayer } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { ChevronDownIcon, SearchIcon } from "lucide-react";
import { Suspense, useState } from "react";

import { CardArtThumb } from "@/components/cards/card-art-thumb";
import { Heading } from "@/components/heading";
import {
  MetaEventDeckPreview,
  MetaEventDeckPreviewSkeleton,
} from "@/components/meta/meta-event-deck-preview";
import { MetaIdentity } from "@/components/meta/meta-identity";
import { MetaListStatusBadge } from "@/components/meta/meta-list-status-badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Medal } from "@/components/ui/podium";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useUserId } from "@/lib/auth-session";
import { formatRank, formatRecord, MEDAL_RANKS } from "@/lib/meta-format";
import { metaSubmitSearchForPlayer } from "@/lib/meta-submit-link";
import { cn } from "@/lib/utils";

const ROWS_SHOWN = 16;

const COLUMN_COUNT = 5;

type StandingsFilter = "all" | "withList";

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

function LegendCell({ player }: { player: MetaEventPlayer }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <CardArtThumb
        imageId={player.legend?.imageId ?? player.champion?.imageId ?? null}
        domains={player.legend?.domains}
        loading="lazy"
        className="w-9"
      />
      <MetaIdentity
        name={player.legend?.name}
        slug={player.legend?.slug}
        archiveSlug={player.legend?.archiveSlug}
        domains={player.legend?.domains}
        layout="stacked"
      />
    </div>
  );
}

function DeckCell({
  player,
  slug,
  canSubmit,
  expanded,
  onToggle,
  className,
}: {
  player: MetaEventPlayer;
  slug: string;
  canSubmit: boolean;
  expanded: boolean;
  onToggle: () => void;
  className?: string;
}) {
  if (player.shareToken !== null) {
    return (
      <div className={cn("flex items-center gap-1.5", className)}>
        <MetaListStatusBadge listStatus={player.listStatus} />
        <Button variant="ghost" size="sm" aria-expanded={expanded} onClick={onToggle}>
          Decklist
          <ChevronDownIcon className={cn("transition-transform", expanded && "rotate-180")} />
        </Button>
      </div>
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

function DeckPreview({ token }: { token: string }) {
  return (
    <Suspense fallback={<MetaEventDeckPreviewSkeleton />}>
      <MetaEventDeckPreview token={token} />
    </Suspense>
  );
}

interface RowProps {
  player: MetaEventPlayer;
  slug: string;
  canSubmit: boolean;
  expanded: boolean;
  onToggle: () => void;
}

function rowToggleHandler(onToggle: () => void) {
  return (event: React.MouseEvent<HTMLElement>) => {
    const target = event.target;
    if (target instanceof Element && target.closest("a, button") !== null) {
      return;
    }
    onToggle();
  };
}

function DesktopRow({ player, slug, canSubmit, expanded, onToggle }: RowProps) {
  const record = formatRecord(player.wins, player.losses, player.draws);
  const token = player.shareToken;

  return (
    <>
      <TableRow
        onClick={token === null ? undefined : rowToggleHandler(onToggle)}
        className={cn(
          player.rank === 1 && "bg-border-accent/10",
          token !== null && "cursor-pointer",
        )}
      >
        <TableCell>
          <Rank player={player} />
        </TableCell>
        <TableCell className="font-medium">{player.playerName}</TableCell>
        <TableCell className="text-right tabular-nums">{record}</TableCell>
        <TableCell>
          <LegendCell player={player} />
        </TableCell>
        <TableCell className="text-right">
          <DeckCell
            player={player}
            slug={slug}
            canSubmit={canSubmit}
            expanded={expanded}
            onToggle={onToggle}
            className="justify-end"
          />
        </TableCell>
      </TableRow>
      {expanded && token !== null && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={COLUMN_COUNT} className="p-3 whitespace-normal">
            <DeckPreview token={token} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function PhoneRow({ player, slug, canSubmit, expanded, onToggle }: RowProps) {
  const record = formatRecord(player.wins, player.losses, player.draws);
  const token = player.shareToken;

  return (
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- the row's keyboard path is the Decklist button inside it, which owns aria-expanded
    <li
      onClick={token === null ? undefined : rowToggleHandler(onToggle)}
      className={cn(
        "flex flex-col gap-2 px-3 py-2 text-sm not-last:border-b",
        player.rank === 1 && "bg-border-accent/10",
        token !== null && "cursor-pointer",
      )}
    >
      <div className="flex items-center gap-2.5">
        <Rank player={player} />
        <CardArtThumb
          imageId={player.legend?.imageId ?? player.champion?.imageId ?? null}
          domains={player.legend?.domains}
          loading="lazy"
          className="w-9"
        />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate font-medium">{player.playerName}</p>
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
          <DeckCell
            player={player}
            slug={slug}
            canSubmit={canSubmit}
            expanded={expanded}
            onToggle={onToggle}
          />
        </div>
      </div>
      {expanded && token !== null && <DeckPreview token={token} />}
    </li>
  );
}

function subtitleFor(total: number, withLists: number): string {
  const entries = `${total.toLocaleString("en-US")} ${total === 1 ? "entry" : "entries"}`;
  if (withLists === 0) {
    return entries;
  }
  return `${entries} · ${withLists.toLocaleString("en-US")} with a decklist`;
}

/**
 * The whole field, best finish first, with every decklist the archive holds
 * openable in place (ADR-014). A table on desktop and two-line rows on phones:
 * the facts a row carries do not survive being squeezed into phone-width
 * columns, and the legend is the first thing a narrow table drops.
 */
export function MetaEventStandings({
  players,
  slug,
}: {
  players: readonly MetaEventPlayer[];
  slug: string;
}) {
  const canSubmit = useUserId() !== null;
  const [showAll, setShowAll] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<StandingsFilter>("all");
  const [query, setQuery] = useState("");

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

  const withLists = players.filter((player) => player.shareToken !== null).length;
  const needle = query.trim().toLowerCase();
  const matching = players.filter(
    (player) =>
      (filter === "all" || player.shareToken !== null) &&
      (needle === "" || player.playerName.toLowerCase().includes(needle)),
  );
  const shown = showAll ? matching : matching.slice(0, ROWS_SHOWN);
  const hidden = matching.length - shown.length;
  const showSearch = players.length > 8;
  const toggle = (id: string) => setExpandedId(expandedId === id ? null : id);

  return (
    <section className="mt-8">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Heading>Standings</Heading>
        <p className="text-muted-foreground text-sm">{subtitleFor(players.length, withLists)}</p>
      </div>

      {(withLists > 0 || showSearch) && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {withLists > 0 && (
            <ToggleGroup
              variant="outline"
              spacing={0}
              value={[filter]}
              onValueChange={([next]) => {
                if (next === "all" || next === "withList") {
                  setFilter(next);
                }
              }}
              aria-label="Which entries to show"
            >
              <ToggleGroupItem value="all">All entries</ToggleGroupItem>
              <ToggleGroupItem value="withList">With decklist ({withLists})</ToggleGroupItem>
            </ToggleGroup>
          )}
          {showSearch && (
            <div className="relative min-w-48 flex-1 sm:max-w-64">
              <SearchIcon
                aria-hidden
                className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
              />
              <Input
                type="search"
                aria-label="Find a player"
                placeholder="Find a player…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="pl-8"
              />
            </div>
          )}
        </div>
      )}

      <div className="bg-card ring-foreground/10 overflow-hidden rounded-lg ring-1">
        {matching.length === 0 ? (
          <p className="text-muted-foreground px-3 py-6 text-center text-sm">No entries match.</p>
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Rank</TableHead>
                    <TableHead>Player</TableHead>
                    <TableHead className="w-24 text-right">Record</TableHead>
                    <TableHead className="w-64">Legend</TableHead>
                    <TableHead className="w-40 text-right">Decklist</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shown.map((player) => (
                    <DesktopRow
                      key={player.id}
                      player={player}
                      slug={slug}
                      canSubmit={canSubmit}
                      expanded={expandedId === player.id}
                      onToggle={() => toggle(player.id)}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>

            <ul className="flex flex-col md:hidden">
              {shown.map((player) => (
                <PhoneRow
                  key={player.id}
                  player={player}
                  slug={slug}
                  canSubmit={canSubmit}
                  expanded={expandedId === player.id}
                  onToggle={() => toggle(player.id)}
                />
              ))}
            </ul>
          </>
        )}

        {matching.length > 0 && (hidden > 0 || showAll) && (
          <div className="border-t">
            <Button
              variant="ghost"
              className="w-full rounded-none"
              onClick={() => setShowAll(!showAll)}
            >
              {showAll ? "Show fewer" : `Show all ${matching.length} entries`}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

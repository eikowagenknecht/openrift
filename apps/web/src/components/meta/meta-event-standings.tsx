import type { MetaEventPlayer } from "@openrift/shared";
import { todayUtc } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { ChevronRightIcon, SearchIcon } from "lucide-react";
import { Suspense, useState } from "react";

import { CardArtThumb } from "@/components/cards/card-art-thumb";
import { CardDetailOverlayProvider } from "@/components/cards/card-detail-opener";
import { Heading } from "@/components/heading";
import type { MetaCostFilterValue } from "@/components/meta/meta-deck-cost-filter";
import {
  EMPTY_META_COST_FILTER,
  MetaDeckCostFilter,
} from "@/components/meta/meta-deck-cost-filter";
import { MetaDeckCostsBridge } from "@/components/meta/meta-deck-costs-bridge";
import {
  MetaEventDeckPreview,
  MetaEventDeckPreviewSkeleton,
} from "@/components/meta/meta-event-deck-preview";
import { MetaIdentity } from "@/components/meta/meta-identity";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Medal } from "@/components/ui/podium";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useHydrated } from "@/hooks/use-hydrated";
import { useMetaPriceFormat } from "@/hooks/use-meta-price-format";
import { useUserId } from "@/lib/auth-session";
import type { MetaDeckCost } from "@/lib/meta-deck-collection";
import { formatRank, formatRecord, MEDAL_RANKS } from "@/lib/meta-format";
import {
  costMatchesBounds,
  countStandingsUnderCost,
  highestStandingsCost,
  isCostFilterActive,
} from "@/lib/meta-standings-cost";
import { metaSubmitSearchForPlayer } from "@/lib/meta-submit-link";
import { cn } from "@/lib/utils";

const ROWS_SHOWN = 16;

type StandingsFilter = "all" | "withList";

const ANY_LEGEND = "any";

/** The legends the field played, commonest first. Keyed by card id so legends sharing a champion stay apart. */
function legendOptions(players: readonly MetaEventPlayer[]): Record<string, string> {
  const counts = new Map<string, { name: string; count: number }>();
  for (const player of players) {
    if (player.legend === null) {
      continue;
    }
    const seen = counts.get(player.legend.cardId);
    counts.set(player.legend.cardId, {
      name: player.legend.name,
      count: (seen?.count ?? 0) + 1,
    });
  }
  if (counts.size < 2) {
    return {};
  }
  const ordered = [...counts.entries()].sort(
    (a, b) => b[1].count - a[1].count || a[1].name.localeCompare(b[1].name),
  );
  return {
    [ANY_LEGEND]: "Any legend",
    ...Object.fromEntries(
      ordered.map(([cardId, entry]) => [cardId, `${entry.name} (${entry.count})`]),
    ),
  };
}

interface StandingsColumns {
  legend: boolean;
  value: boolean;
  deck: boolean;
}

function standingsColumns(
  players: readonly MetaEventPlayer[],
  canSubmit: boolean,
): StandingsColumns {
  const anyList = players.some((player) => player.shareToken !== null);
  return {
    legend: players.some((player) => player.legend !== null || player.champion !== null),
    value: anyList,
    deck: canSubmit || anyList,
  };
}

/** Rank and player always stand; the other three are conditional. */
function columnCount(columns: StandingsColumns): number {
  return 2 + (columns.legend ? 1 : 0) + (columns.value ? 1 : 0) + (columns.deck ? 1 : 0);
}

function Rank({ player }: { player: MetaEventPlayer }) {
  if (player.rank <= MEDAL_RANKS) {
    return <Medal rank={player.rank} />;
  }
  return (
    <span className="text-muted-foreground tabular-nums">
      {formatRank(player.rank, player.rankIsTier)}
    </span>
  );
}

function RankCell({ player, className }: { player: MetaEventPlayer; className?: string }) {
  const record = formatRecord(player.wins, player.losses, player.draws);
  return (
    <div className={cn("flex flex-col items-center gap-0.5 leading-tight", className)}>
      <Rank player={player} />
      {record !== null && (
        <span className="text-muted-foreground text-xs tabular-nums">{record}</span>
      )}
    </div>
  );
}

function MissingLine({ cost }: { cost: MetaDeckCost }) {
  const format = useMetaPriceFormat();
  if (cost.owned === undefined || cost.needed === 0) {
    return null;
  }
  if (cost.owned >= cost.needed) {
    return <span className="text-border-accent text-xs font-medium">Buildable</span>;
  }
  if (cost.toComplete === undefined || cost.toComplete === 0) {
    return null;
  }
  return <span className="text-muted-foreground text-xs">{format(cost.toComplete)} missing</span>;
}

function DeckValue({
  player,
  costs,
  className,
}: {
  player: MetaEventPlayer;
  costs: ReadonlyMap<string, MetaDeckCost> | undefined;
  className?: string;
}) {
  const format = useMetaPriceFormat();
  const cost = player.deckId === null ? undefined : costs?.get(player.deckId);
  if (cost === undefined) {
    return null;
  }
  return (
    <div className={cn("flex flex-col items-end gap-0.5 leading-tight tabular-nums", className)}>
      {cost.value !== undefined && <span>{format(cost.value)}</span>}
      <MissingLine cost={cost} />
    </div>
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
  className,
}: {
  player: MetaEventPlayer;
  slug: string;
  canSubmit: boolean;
  expanded: boolean;
  className?: string;
}) {
  if (player.shareToken !== null) {
    return (
      <span
        className={cn(
          "text-muted-foreground inline-flex items-center gap-1 whitespace-nowrap",
          className,
        )}
      >
        {player.listStatus === "partial" ? "Partial list" : "Decklist"}
        <ChevronRightIcon
          className={cn("size-4 shrink-0 transition-transform", expanded && "rotate-90")}
        />
      </span>
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
      className={cn("text-primary font-medium whitespace-nowrap hover:underline", className)}
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
  columns: StandingsColumns;
  costs: ReadonlyMap<string, MetaDeckCost> | undefined;
  expanded: boolean;
  onToggle: () => void;
}

function ownsClick(event: React.SyntheticEvent<HTMLElement>): boolean {
  const target = event.target;
  return target instanceof Element && target.closest("a, button, [role=menu]") !== null;
}

/** The row is the disclosure: click anywhere on it, or Enter / Space while it has focus. */
function rowToggleProps(token: string | null, expanded: boolean, onToggle: () => void) {
  if (token === null) {
    return {};
  }
  return {
    tabIndex: 0,
    "aria-expanded": expanded,
    onClick: (event: React.MouseEvent<HTMLElement>) => {
      if (!ownsClick(event)) {
        onToggle();
      }
    },
    onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
      if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) {
        return;
      }
      event.preventDefault();
      onToggle();
    },
  };
}

function DesktopRow({ player, slug, canSubmit, columns, costs, expanded, onToggle }: RowProps) {
  const token = player.shareToken;

  return (
    <>
      <TableRow
        {...rowToggleProps(token, expanded, onToggle)}
        className={cn(
          "focus-visible:ring-ring aria-expanded:bg-muted/50 focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset",
          player.rank === 1 && "bg-border-accent/10",
          token !== null && "cursor-pointer",
        )}
      >
        <TableCell>
          <RankCell player={player} className="w-12" />
        </TableCell>
        {columns.legend && (
          <TableCell>
            <LegendCell player={player} />
          </TableCell>
        )}
        <TableCell className="truncate font-medium">{player.playerName}</TableCell>
        {columns.value && (
          <TableCell className="text-right">
            <DeckValue player={player} costs={costs} />
          </TableCell>
        )}
        {columns.deck && (
          <TableCell className="text-right">
            <DeckCell player={player} slug={slug} canSubmit={canSubmit} expanded={expanded} />
          </TableCell>
        )}
      </TableRow>
      {expanded && token !== null && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={columnCount(columns)} className="p-3 whitespace-normal">
            <DeckPreview token={token} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function PhoneRow({ player, slug, canSubmit, columns, costs, expanded, onToggle }: RowProps) {
  const token = player.shareToken;

  return (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex -- the row is the disclosure, with aria-expanded and Enter / Space on itself
    <li
      {...rowToggleProps(token, expanded, onToggle)}
      className={cn(
        "focus-visible:ring-ring aria-expanded:bg-muted/50 flex flex-col gap-2 px-3 py-2 text-sm not-last:border-b focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset",
        player.rank === 1 && "bg-border-accent/10",
        token !== null && "cursor-pointer",
      )}
    >
      <div className="flex items-center gap-2.5">
        <RankCell player={player} className="w-10 shrink-0" />
        {columns.legend && (
          <CardArtThumb
            imageId={player.legend?.imageId ?? player.champion?.imageId ?? null}
            domains={player.legend?.domains}
            loading="lazy"
            className="w-9"
          />
        )}
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
          {columns.value && <DeckValue player={player} costs={costs} />}
          {columns.deck && (
            <DeckCell player={player} slug={slug} canSubmit={canSubmit} expanded={expanded} />
          )}
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
  eventDate,
}: {
  players: readonly MetaEventPlayer[];
  slug: string;
  /** UTC date. */
  eventDate: string;
}) {
  const canSubmit = useUserId() !== null;
  const hydrated = useHydrated();
  const [costs, setCosts] = useState<ReadonlyMap<string, MetaDeckCost>>();
  const [showAll, setShowAll] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<StandingsFilter>("all");
  const [legendId, setLegendId] = useState(ANY_LEGEND);
  const [query, setQuery] = useState("");
  // The Value column prices the sideboard in, so the filter has to price it in too.
  const [costFilter, setCostFilter] = useState<MetaCostFilterValue>({
    ...EMPTY_META_COST_FILTER,
    includeSideboard: true,
  });

  if (players.length === 0) {
    return (
      <section className="mt-8">
        <Heading className="mb-3">Standings</Heading>
        <Empty>
          <EmptyHeader>
            <EmptyDescription>
              {eventDate > todayUtc()
                ? "This event has not been played yet. Standings will appear here once it has."
                : "No standings on file for this event yet."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </section>
    );
  }

  const columns = standingsColumns(players, canSubmit);
  const withLists = players.filter((player) => player.shareToken !== null).length;
  const needle = query.trim().toLowerCase();
  const legends = legendOptions(players);
  const costActive = costs !== undefined && isCostFilterActive(costFilter);
  const matching = players.filter(
    (player) =>
      (filter === "all" || player.shareToken !== null) &&
      (legendId === ANY_LEGEND || player.legend?.cardId === legendId) &&
      (needle === "" || player.playerName.toLowerCase().includes(needle)) &&
      (!costActive ||
        costMatchesBounds(
          player.deckId === null ? undefined : costs?.get(player.deckId),
          costFilter,
        )),
  );
  const shown = showAll ? matching : matching.slice(0, ROWS_SHOWN);
  const hidden = matching.length - shown.length;
  const showSearch = players.length > 8;
  const showLegendFilter = showSearch && Object.keys(legends).length > 0;
  const toggle = (id: string) => setExpandedId(expandedId === id ? null : id);

  return (
    <CardDetailOverlayProvider>
      <section className="mt-8">
        {hydrated && columns.value && (
          <Suspense fallback={null}>
            <MetaDeckCostsBridge
              includeSideboard={costFilter.includeSideboard}
              withCollection={canSubmit}
              onChange={setCosts}
            />
          </Suspense>
        )}

        <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <Heading>Standings</Heading>
          <p className="text-muted-foreground text-sm">{subtitleFor(players.length, withLists)}</p>
        </div>

        {(withLists > 0 || showSearch || showLegendFilter) && (
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
            {showLegendFilter && (
              <Select
                value={legendId}
                onValueChange={(value) => setLegendId((value as string | null) ?? ANY_LEGEND)}
                items={legends}
              >
                <SelectTrigger className="w-56" aria-label="Filter by legend">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(legends).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {columns.value && (
              <MetaDeckCostFilter
                trigger="control"
                noun="list"
                ready={costs !== undefined}
                withCollection={canSubmit}
                countUnderCost={(maxCost) =>
                  countStandingsUnderCost(players, costs, costFilter, maxCost)
                }
                maxToComplete={highestStandingsCost(players, costs, (cost) => cost.toComplete)}
                maxValue={highestStandingsCost(players, costs, (cost) => cost.value)}
                value={costFilter}
                onMaxCostChange={(next) =>
                  setCostFilter((current) => ({ ...current, maxCost: next }))
                }
                onValueRangeChange={(next) =>
                  setCostFilter((current) => ({ ...current, valueRange: next }))
                }
                onIncludeSideboardChange={(next) =>
                  setCostFilter((current) => ({ ...current, includeSideboard: next }))
                }
                onClear={() =>
                  setCostFilter((current) => ({
                    ...current,
                    maxCost: null,
                    valueRange: { min: null, max: null },
                  }))
                }
              />
            )}
          </div>
        )}

        <Card className="gap-0 py-0">
          {matching.length === 0 ? (
            <p className="text-muted-foreground px-3 py-6 text-center text-sm">No entries match.</p>
          ) : (
            <>
              <div className="hidden md:block">
                <Table className="table-fixed">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20 text-center">Rank</TableHead>
                      {columns.legend && <TableHead className="w-64">Legend</TableHead>}
                      <TableHead>Player</TableHead>
                      {columns.value && <TableHead className="w-28 text-right">Value</TableHead>}
                      {columns.deck && <TableHead className="w-36 text-right">Decklist</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shown.map((player) => (
                      <DesktopRow
                        key={player.id}
                        player={player}
                        slug={slug}
                        canSubmit={canSubmit}
                        columns={columns}
                        costs={costs}
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
                    columns={columns}
                    costs={costs}
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
        </Card>
      </section>
    </CardDetailOverlayProvider>
  );
}

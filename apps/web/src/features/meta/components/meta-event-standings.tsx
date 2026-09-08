import { todayUtc } from "@openrift/shared/set-release";
import type {
  MetaEventMatch,
  MetaEventPhase,
  MetaEventPlayer,
} from "@openrift/shared/types/api/meta";
import { SearchIcon } from "lucide-react";
import { Suspense, useState } from "react";

import { Heading } from "@/components/heading";
import { Card } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CardDetailOverlayProvider } from "@/features/cards/components/card-detail-opener";
import type { MetaCostFilterValue } from "@/features/meta/components/meta-deck-cost-filter";
import {
  EMPTY_META_COST_FILTER,
  MetaDeckCostFilter,
} from "@/features/meta/components/meta-deck-cost-filter";
import { MetaDeckCostsBridge } from "@/features/meta/components/meta-deck-costs-bridge";
import {
  DesktopStandings,
  PhoneStandings,
} from "@/features/meta/components/meta-event-standings-body";
import type { MetaDeckCost } from "@/features/meta/lib/meta-deck-collection";
import {
  ANY_LEGEND,
  legendOptions,
  standingsColumns,
  subtitleFor,
} from "@/features/meta/lib/meta-event-standings";
import { metaPlayerRounds } from "@/features/meta/lib/meta-player-run";
import {
  costMatchesBounds,
  countStandingsUnderCost,
  highestStandingsCost,
  isCostFilterActive,
} from "@/features/meta/lib/meta-standings-cost";
import { useHydrated } from "@/hooks/use-hydrated";
import { useUserId } from "@/lib/auth-session";

type StandingsFilter = "all" | "withList";

export function MetaEventStandings({
  players,
  matches,
  phases,
  slug,
  eventDate,
}: {
  players: readonly MetaEventPlayer[];
  matches: readonly MetaEventMatch[];
  phases: readonly MetaEventPhase[];
  slug: string;
  /** UTC date. */
  eventDate: string;
}) {
  const canSubmit = useUserId() !== null;
  const hydrated = useHydrated();
  const [costs, setCosts] = useState<ReadonlyMap<string, MetaDeckCost>>();
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

  const rounds = metaPlayerRounds(matches, phases);
  const columns = standingsColumns(players, canSubmit, rounds.size > 0);
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
  const showSearch = players.length > 8;
  const showLegendFilter = showSearch && Object.keys(legends).length > 0;
  const toggle = (id: string) => setExpandedId(expandedId === id ? null : id);
  const body = {
    players: matching,
    slug,
    canSubmit,
    columns,
    costs,
    rounds,
    expandedId,
    onToggle: toggle,
  };

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
              <DesktopStandings {...body} />
              <PhoneStandings {...body} />
            </>
          )}
        </Card>
      </section>
    </CardDetailOverlayProvider>
  );
}

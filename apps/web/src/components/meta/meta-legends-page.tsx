import { formatDay } from "@openrift/shared";
import { Link, getRouteApi } from "@tanstack/react-router";
import { SwordsIcon } from "lucide-react";

import { CardArtThumb } from "@/components/cards/card-art-thumb";
import { DomainIcon } from "@/components/deck/domain-icon";
import { EmptyState } from "@/components/empty-state";
import { SearchInput } from "@/components/filters/search-input";
import {
  PageDescription,
  PageTopBar,
  PageTopBarBack,
  PageTopBarSticky,
  PageTopBarTitle,
} from "@/components/layout/page-top-bar";
import { META_LEGENDS_DESCRIPTION } from "@/components/meta/meta-copy";
import { IndexSortButton } from "@/components/meta/meta-index-sort-button";
import { MetaScopeBar } from "@/components/meta/meta-scope-bar";
import { MetaTierBadge } from "@/components/meta/meta-tier-badge";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import { Medal } from "@/components/ui/podium";
import { useMetaEvents, useMetaLegends } from "@/hooks/use-meta";
import { useMetaEras } from "@/hooks/use-meta-eras";
import { useSearchUrlSync } from "@/hooks/use-search-url-sync";
import { formatRank, MEDAL_RANKS, metaShownLabel, splitLegendName } from "@/lib/meta-format";
import type { MetaLegendIndexEntry } from "@/lib/meta-legend-page";
import {
  metaLegendIndexCountries,
  metaLegendIndexEntries,
  nextLegendSort,
  sortMetaLegendEntries,
} from "@/lib/meta-legend-page";
import type { MetaLegendIndexSort } from "@/lib/meta-legends-search";
import { DEFAULT_LEGEND_DIRECTION, DEFAULT_LEGEND_SORT } from "@/lib/meta-legends-search";
import type { MetaScope } from "@/lib/meta-scope";
import { CLEARED_SCOPE, nextScopeSearch, resolveScopeRange } from "@/lib/meta-scope";
import { cn, PAGE_WIDTH } from "@/lib/utils";

const routeApi = getRouteApi("/_app/meta_/legends");

/**
 * The desktop column track, shared by the rows and the sort header above them so
 * the two can never drift apart.
 */
const LEGEND_INDEX_GRID =
  "grid grid-cols-[3rem_minmax(0,1fr)_minmax(0,1.6fr)_4.5rem_4.5rem] items-center gap-x-3.5";

const SortButton = IndexSortButton<MetaLegendIndexSort>;

function Rank({ rank, rankIsTier }: { rank: number; rankIsTier: boolean }) {
  return (
    <span className="flex w-10 shrink-0 justify-center">
      {rank <= MEDAL_RANKS ? (
        <Medal rank={rank} />
      ) : (
        <span className="text-muted-foreground text-sm tabular-nums">
          {formatRank(rank, rankIsTier)}
        </span>
      )}
    </span>
  );
}

function bestFinishFacts(entry: MetaLegendIndexEntry): string {
  const { event } = entry.bestFinish;
  const parts = [formatDay(event.eventDate)];
  if (event.playerCount !== null) {
    parts.push(
      `${event.playerCount.toLocaleString("en-US")} ${event.playerCount === 1 ? "player" : "players"}`,
    );
  }
  return parts.join(" · ");
}

function WinsChip({ eventWins, className }: { eventWins: number; className?: string }) {
  if (eventWins === 0) {
    return null;
  }
  return (
    <Badge variant="subtle" className={className}>
      {eventWins.toLocaleString("en-US")} {eventWins === 1 ? "event win" : "event wins"}
    </Badge>
  );
}

function LegendArt({ entry, className }: { entry: MetaLegendIndexEntry; className: string }) {
  return (
    <CardArtThumb
      shape="square"
      imageId={entry.legend.imageId}
      domains={entry.legend.domains}
      loading="lazy"
      className={className}
    />
  );
}

/** Both size variants share one Link so a legend is one click target and one tab stop. */
function LegendRow({ entry }: { entry: MetaLegendIndexEntry }) {
  const { champion, title } = splitLegendName(entry.legend.name);
  const best = entry.bestFinish;

  return (
    <Link
      to="/meta/legends/$slug"
      params={{ slug: entry.slug }}
      className="hover:bg-muted/50 focus-visible:ring-ring/50 block px-4 py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-inset"
    >
      <div className={cn(LEGEND_INDEX_GRID, "hidden md:grid")}>
        <LegendArt entry={entry} className="size-12" />
        <div className="min-w-0">
          <p className="flex min-w-0 items-center gap-1.5">
            <span className="truncate font-medium">{champion}</span>
            {entry.legend.domains.map((domain) => (
              <DomainIcon key={domain} domain={domain} className="size-4 shrink-0" />
            ))}
            <WinsChip eventWins={entry.eventWins} className="hidden lg:inline-flex" />
          </p>
          {title !== null && <p className="text-muted-foreground truncate text-xs">{title}</p>}
        </div>
        <div className="min-w-0">
          <p className="flex min-w-0 items-center gap-2">
            <Rank rank={best.rank} rankIsTier={best.rankIsTier} />
            <span className="truncate text-sm font-medium">{best.event.name}</span>
          </p>
          <p className="text-muted-foreground flex min-w-0 items-center gap-1.5 pl-12 text-xs">
            <MetaTierBadge tier={best.event.tier} />
            <span className="truncate tabular-nums">{bestFinishFacts(entry)}</span>
          </p>
        </div>
        <span className="text-muted-foreground text-right text-sm tabular-nums">
          {entry.decklists.toLocaleString("en-US")}
        </span>
        <span className="text-muted-foreground text-right text-sm tabular-nums">
          {entry.finishes.toLocaleString("en-US")}
        </span>
      </div>

      <div className="flex items-start gap-2.5 md:hidden">
        <LegendArt entry={entry} className="mt-0.5 size-10" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="flex min-w-0 items-center gap-1.5">
            <span className="truncate font-medium">{champion}</span>
            {entry.legend.domains.map((domain) => (
              <DomainIcon key={domain} domain={domain} className="size-4 shrink-0" />
            ))}
            <WinsChip eventWins={entry.eventWins} />
            <span className="text-muted-foreground ml-auto shrink-0 text-xs tabular-nums">
              {entry.decklists.toLocaleString("en-US")}{" "}
              {entry.decklists === 1 ? "decklist" : "decklists"}
            </span>
          </p>
          {title !== null && <p className="text-muted-foreground truncate text-xs">{title}</p>}
          <p className="flex min-w-0 items-center gap-2">
            <Rank rank={best.rank} rankIsTier={best.rankIsTier} />
            <span className="truncate text-sm">{best.event.name}</span>
            <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
              {formatDay(best.event.eventDate)}
            </span>
          </p>
        </div>
      </div>
    </Link>
  );
}

function LegendSearchBox({
  urlValue,
  onCommit,
}: {
  urlValue: string;
  onCommit: (value: string) => void;
}) {
  const [value, setValue] = useSearchUrlSync({ urlValue, onCommit });
  return (
    <SearchInput
      className="min-w-56 flex-1"
      value={value}
      onValueChange={setValue}
      placeholder="Search legends"
    />
  );
}

function SortHeader({
  sort,
  direction,
  onSort,
}: {
  sort: MetaLegendIndexSort;
  direction: "asc" | "desc";
  onSort: (column: MetaLegendIndexSort) => void;
}) {
  return (
    <div
      className={cn(
        LEGEND_INDEX_GRID,
        "border-border text-muted-foreground hidden border-b px-4 py-2 text-xs font-semibold md:grid",
      )}
    >
      <span />
      <SortButton column="name" sort={sort} direction={direction} onSort={onSort}>
        Legend
      </SortButton>
      <SortButton column="best" sort={sort} direction={direction} onSort={onSort}>
        Best finish in this scope
      </SortButton>
      <SortButton column="decklists" sort={sort} direction={direction} onSort={onSort} align="end">
        Decklists
      </SortButton>
      <SortButton column="finishes" sort={sort} direction={direction} onSort={onSort} align="end">
        Finishes
      </SortButton>
    </div>
  );
}

/** The scoped era ships as one payload, so search, facets, and sort all run client-side against it. */
export function MetaLegendsPage() {
  const search = routeApi.useSearch();
  const navigate = routeApi.useNavigate();
  const { data } = useMetaLegends();
  const eras = useMetaEras();
  const { data: eventsData } = useMetaEvents(resolveScopeRange(search, eras));

  const sort = search.by ?? DEFAULT_LEGEND_SORT;
  const direction = search.dir ?? DEFAULT_LEGEND_DIRECTION;

  const setSearchParams = (patch: Record<string, unknown>) => {
    void navigate({ search: (prev) => nextScopeSearch(prev, patch), replace: true });
  };

  const setScope = (patch: Partial<MetaScope>) => setSearchParams(patch);
  const clearScope = () => setSearchParams({ ...CLEARED_SCOPE, q: undefined });
  const setSort = (column: MetaLegendIndexSort) => {
    const next = nextLegendSort({ sort, direction }, column);
    setSearchParams({ by: next.sort, dir: next.direction });
  };
  const commitQuery = (value: string) => setSearchParams({ q: value === "" ? undefined : value });

  const all = data.legends;
  const events = eventsData.events;
  const entries = sortMetaLegendEntries(
    metaLegendIndexEntries(all, events, { scope: search, eras, search: search.q }),
    sort,
    direction,
  );
  const countries = metaLegendIndexCountries(all, events);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageTopBarSticky width="capped">
        <PageTopBar>
          <PageTopBarBack to="/meta" aria-label="Meta archive" />
          <PageTopBarTitle>Legends</PageTopBarTitle>
          <span className="text-muted-foreground shrink-0 tabular-nums">
            {metaShownLabel(entries.length, all.length, {
              singular: "legend",
              plural: "legends",
            })}
          </span>
        </PageTopBar>
      </PageTopBarSticky>

      <div className={cn(PAGE_WIDTH.capped, "px-safe pt-3 pb-6")}>
        <PageDescription className="pb-4">{META_LEGENDS_DESCRIPTION}</PageDescription>

        {all.length === 0 ? (
          <EmptyState
            className="py-12"
            icon={SwordsIcon}
            title="No legends on record yet"
            description="Legends appear here as soon as an event's standings are archived."
          />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <LegendSearchBox urlValue={search.q ?? ""} onCommit={commitQuery} />
              <MetaScopeBar
                scope={search}
                setScope={setScope}
                clearScope={clearScope}
                eras={eras}
                countries={countries}
              />
            </div>

            <Card className="mt-4 gap-0 py-0">
              <SortHeader sort={sort} direction={direction} onSort={setSort} />
              {entries.length === 0 ? (
                <Empty className="py-10">
                  <EmptyHeader>
                    <EmptyDescription>No legend matches these filters.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <ul className="divide-border flex flex-col divide-y">
                  {entries.map((entry) => (
                    <li key={entry.slug}>
                      <LegendRow entry={entry} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

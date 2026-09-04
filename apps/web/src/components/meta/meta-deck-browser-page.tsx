import type { Marketplace, MetaDeckSummary, MetaEventSummary } from "@openrift/shared";
import { LayoutGridIcon, ListIcon } from "lucide-react";
import { Suspense, useEffect, useState } from "react";

import {
  PageDescription,
  PageTopBar,
  PageTopBarBack,
  PageTopBarSticky,
  PageTopBarTitle,
} from "@/components/layout/page-top-bar";
import { MetaArchiveDeckTile } from "@/components/meta/meta-archive-deck-tile";
import { META_DECKS_DESCRIPTION } from "@/components/meta/meta-copy";
import { MetaDeckCostsBridge } from "@/components/meta/meta-deck-costs-bridge";
import { MetaDeckFilterControls } from "@/components/meta/meta-deck-filter-controls";
import { DECK_INDEX_GRID, MetaDeckIndexRow } from "@/components/meta/meta-deck-index-row";
import { IndexSortButton } from "@/components/meta/meta-index-sort-button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useHydrated } from "@/hooks/use-hydrated";
import { useMetaDecks, useMetaEvents } from "@/hooks/use-meta";
import { useMetaDeckFilters } from "@/hooks/use-meta-deck-filters";
import { useMetaEras } from "@/hooks/use-meta-eras";
import { useSession } from "@/lib/auth-session";
import type { MetaDeckCost } from "@/lib/meta-deck-collection";
import {
  countMetaDecksUnderCost,
  curateMetaDecks,
  filterMetaDecks,
  META_DECK_SORT_PRESETS,
  metaDeckFilterCounts,
  metaDeckFilterOptions,
  sortMetaDecks,
} from "@/lib/meta-deck-filters";
import type { MetaDeckSort, MetaDeckSortDirection } from "@/lib/meta-deck-search";
import { metaEventFieldSize, metaShownLabel } from "@/lib/meta-format";
import { resolveScopeRange, scopeKey } from "@/lib/meta-scope";
import { cn, PAGE_WIDTH } from "@/lib/utils";
import type { MetaDeckView } from "@/stores/display-store";
import { useDisplayStore } from "@/stores/display-store";

/** How many lists the page opens with, and how many each "more" adds. */
const PAGE_SIZE = 40;

const DECK_NOUN = { singular: "archived deck", plural: "archived decks" };

function highest(
  costs: ReadonlyMap<string, MetaDeckCost> | undefined,
  pick: (cost: MetaDeckCost) => number | undefined,
): number | undefined {
  if (costs === undefined) {
    return undefined;
  }
  let top: number | undefined;
  for (const cost of costs.values()) {
    const value = pick(cost);
    if (value !== undefined && (top === undefined || value > top)) {
      top = value;
    }
  }
  return top;
}

function MetaDeckBrowserFallback() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

/**
 * Mounts only after hydration: the archive is a multi-megabyte payload, and
 * anything the server touches here is dehydrated into the HTML document.
 */
function MetaDeckBrowser({ onCount }: { onCount: (shown: number, total: number) => void }) {
  const filters = useMetaDeckFilters();
  const eras = useMetaEras();
  const range = resolveScopeRange(filters.scope, eras);
  const { data } = useMetaDecks(range);
  const { data: eventsData } = useMetaEvents();
  const { data: session } = useSession();
  const marketplace = useDisplayStore((state) => state.marketplaceOrder[0] ?? "cardtrader");
  const view = useDisplayStore((state) => state.metaDeckView);
  const setView = useDisplayStore((state) => state.setMetaDeckView);
  const [costs, setCosts] = useState<ReadonlyMap<string, MetaDeckCost>>();

  const signedIn = Boolean(session?.user);
  const values = {
    scope: filters.scope,
    eras,
    events: filters.events,
    legends: filters.legends,
    maxRank: filters.maxRank,
    maxCost: signedIn ? filters.maxCost : null,
    valueMin: filters.valueRange.min,
    valueMax: filters.valueRange.max,
    includeSideboard: filters.includeSideboard,
    showAll: filters.showAll,
  };
  const context = { costs };

  const options = metaDeckFilterOptions(data.decks);
  const counts = metaDeckFilterCounts(data.decks, values, context);
  const matching = filterMetaDecks(data.decks, values, context);
  const decks = sortMetaDecks(
    curateMetaDecks(matching, values),
    filters.sort,
    filters.direction,
    costs,
  );
  const summaries = new Map(eventsData.events.map((event) => [event.slug, event]));
  const eventCount = new Set(decks.map((deck) => deck.event.slug)).size;
  const shown = decks.length;
  const total = data.total;
  useEffect(() => {
    onCount(shown, total);
  }, [onCount, shown, total]);

  const cost = {
    ready: costs !== undefined,
    withCollection: signedIn,
    countUnderCost: (maxCost: number | null) =>
      countMetaDecksUnderCost(data.decks, values, context, maxCost),
    maxToComplete: highest(costs, (entry) => entry.toComplete),
    maxValue: highest(costs, (entry) => entry.value),
  };

  // Reordering is not renarrowing: the same lists in a new order keep their
  // depth, so the sort keys are deliberately absent here.
  const listKey = [
    scopeKey(filters.scope),
    filters.events.join(","),
    filters.legends.join(","),
    filters.maxRank ?? "",
    filters.maxCost ?? "",
    filters.valueRange.min ?? "",
    filters.valueRange.max ?? "",
    filters.showAll ? "all" : "best",
  ].join("|");

  return (
    <>
      <Suspense fallback={null}>
        <MetaDeckCostsBridge
          includeSideboard={filters.includeSideboard}
          withCollection={signedIn}
          range={range}
          onChange={setCosts}
        />
      </Suspense>

      <MetaDeckFilterControls options={options} counts={counts} eras={eras} cost={cost} />

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <ViewToggle view={view} onChange={setView} />
        <ToggleGroup
          variant="outline"
          size="sm"
          spacing={0}
          value={[filters.showAll ? "all" : "best"]}
          onValueChange={([next]) => {
            if (next === "best" || next === "all") {
              filters.setShowAll(next === "all");
            }
          }}
          aria-label="Lists shown"
        >
          <ToggleGroupItem value="best">Best list per legend</ToggleGroupItem>
          <ToggleGroupItem value="all">Every list</ToggleGroupItem>
        </ToggleGroup>
        <p className="text-muted-foreground text-sm tabular-nums">
          {decks.length} {decks.length === 1 ? "deck" : "decks"} · {eventCount}{" "}
          {eventCount === 1 ? "event" : "events"}
        </p>
        {view === "grid" && (
          <SortSelect
            sort={filters.sort}
            direction={filters.direction}
            onChange={(sort, direction) => filters.setSort(sort, direction)}
            className="ml-auto"
          />
        )}
      </div>

      {view === "list" ? (
        <Card className="mt-3 gap-0 py-0">
          <SortHeader
            sort={filters.sort}
            direction={filters.direction}
            onSort={(column) => filters.sortBy(column)}
          />
          {decks.length === 0 ? (
            <NoMatches />
          ) : (
            <DeckList
              key={listKey}
              decks={decks}
              summaries={summaries}
              costs={costs}
              marketplace={marketplace}
            />
          )}
        </Card>
      ) : decks.length === 0 ? (
        <Empty className="mt-6">
          <EmptyHeader>
            <EmptyDescription>No decks match these filters.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <DeckGrid
          key={listKey}
          decks={decks}
          summaries={summaries}
          costs={costs}
          marketplace={marketplace}
        />
      )}
    </>
  );
}

function NoMatches() {
  return (
    <Empty className="py-10">
      <EmptyHeader>
        <EmptyDescription>No decks match these filters.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function ViewToggle({
  view,
  onChange,
}: {
  view: MetaDeckView;
  onChange: (view: MetaDeckView) => void;
}) {
  return (
    <ToggleGroup
      variant="outline"
      size="sm"
      spacing={0}
      value={[view]}
      onValueChange={([next]) => {
        if (next === "list" || next === "grid") {
          onChange(next);
        }
      }}
      aria-label="Layout"
    >
      <ToggleGroupItem value="list">
        <ListIcon aria-hidden />
        List
      </ToggleGroupItem>
      <ToggleGroupItem value="grid">
        <LayoutGridIcon aria-hidden />
        Grid
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

const presetKey = (sort: MetaDeckSort, direction: MetaDeckSortDirection) => `${sort}:${direction}`;

/** The grid's order, as one menu: a grid has no column headers to click. */
function SortSelect({
  sort,
  direction,
  onChange,
  className,
}: {
  sort: MetaDeckSort;
  direction: MetaDeckSortDirection;
  onChange: (sort: MetaDeckSort, direction: MetaDeckSortDirection) => void;
  className?: string;
}) {
  const items: Record<string, string> = {};
  for (const preset of META_DECK_SORT_PRESETS) {
    items[presetKey(preset.sort, preset.direction)] = preset.label;
  }
  const current = presetKey(sort, direction);
  const value = current in items ? current : presetKey("date", "desc");
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        const preset = META_DECK_SORT_PRESETS.find(
          (entry) => presetKey(entry.sort, entry.direction) === next,
        );
        if (preset !== undefined) {
          onChange(preset.sort, preset.direction);
        }
      }}
      items={items}
    >
      <SelectTrigger size="sm" className={cn("w-48", className)} aria-label="Sort">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(items).map(([itemValue, label]) => (
          <SelectItem key={itemValue} value={itemValue}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const SortButton = IndexSortButton<MetaDeckSort>;

/**
 * The column labels, each a sort control where the column has one. Hidden on
 * phones, where the rows are cards and there is nothing for a header to label.
 */
function SortHeader({
  sort,
  direction,
  onSort,
}: {
  sort: MetaDeckSort;
  direction: MetaDeckSortDirection;
  onSort: (column: MetaDeckSort) => void;
}) {
  return (
    <div
      className={cn(
        DECK_INDEX_GRID,
        "border-border text-muted-foreground hidden border-b px-4 py-2 text-xs font-semibold sm:grid",
      )}
    >
      <SortButton column="finish" sort={sort} direction={direction} onSort={onSort}>
        Finish
      </SortButton>
      <span />
      <span>Legend</span>
      <span>Player</span>
      <span>Event</span>
      <SortButton column="date" sort={sort} direction={direction} onSort={onSort}>
        Date
      </SortButton>
      <SortButton column="value" sort={sort} direction={direction} onSort={onSort} align="end">
        Value
      </SortButton>
      <SortButton column="cost" sort={sort} direction={direction} onSort={onSort}>
        To complete
      </SortButton>
    </div>
  );
}

interface DeckListProps {
  decks: MetaDeckSummary[];
  summaries: ReadonlyMap<string, MetaEventSummary>;
  costs?: ReadonlyMap<string, MetaDeckCost>;
  marketplace: Marketplace;
}

function fieldSizeOf(summary: MetaEventSummary | undefined): number | null {
  return summary === undefined ? null : metaEventFieldSize(summary);
}

/**
 * The rows, opened at {@link PAGE_SIZE} and extended a page at a time. Remounted
 * whenever the filters change (its `key`), so a narrowed view always starts at
 * the top of its own list.
 */
function DeckList({ decks, summaries, costs, marketplace }: DeckListProps) {
  const [shown, setShown] = useState(PAGE_SIZE);
  const remaining = decks.length - shown;

  return (
    <>
      <ul className="divide-border flex flex-col divide-y">
        {decks.slice(0, shown).map((deck) => (
          <li key={deck.deckId}>
            <MetaDeckIndexRow
              deck={deck}
              cost={costs?.get(deck.deckId)}
              fieldSize={fieldSizeOf(summaries.get(deck.event.slug))}
              marketplace={marketplace}
            />
          </li>
        ))}
      </ul>
      {remaining > 0 && (
        <div className="border-border flex justify-center border-t p-2">
          <Button variant="ghost" size="sm" onClick={() => setShown(shown + PAGE_SIZE)}>
            {remaining.toLocaleString("en-US")} more {remaining === 1 ? "deck" : "decks"}
          </Button>
        </div>
      )}
    </>
  );
}

function DeckGrid({ decks, summaries, costs, marketplace }: DeckListProps) {
  const [shown, setShown] = useState(PAGE_SIZE);
  const remaining = decks.length - shown;

  return (
    <>
      <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {decks.slice(0, shown).map((deck) => (
          <li key={deck.deckId}>
            <MetaArchiveDeckTile
              deck={deck}
              cost={costs?.get(deck.deckId)}
              fieldSize={fieldSizeOf(summaries.get(deck.event.slug)) ?? undefined}
              marketplace={marketplace}
              showEvent
            />
          </li>
        ))}
      </ul>
      {remaining > 0 && (
        <div className="flex justify-center pt-5">
          <Button variant="outline" onClick={() => setShown(shown + PAGE_SIZE)}>
            Show {Math.min(PAGE_SIZE, remaining)} more of {remaining.toLocaleString("en-US")}
          </Button>
        </div>
      )}
    </>
  );
}

/**
 * `/meta/decks` — the cross-event deck browser. The endpoint hands over the
 * scoped archive and every filter runs client-side (ADR-014), so narrowing is
 * instant and one cacheable payload serves every view.
 */
export function MetaDeckBrowserPage() {
  const hydrated = useHydrated();
  const [count, setCount] = useState<{ shown: number; total: number }>();
  const onCount = (shown: number, total: number) => {
    setCount((prev) => (prev?.shown === shown && prev.total === total ? prev : { shown, total }));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageTopBarSticky width="full">
        <PageTopBar>
          <PageTopBarBack to="/meta" aria-label="Meta archive" />
          <PageTopBarTitle>Archived decks</PageTopBarTitle>
          {count !== undefined && (
            <span className="text-muted-foreground shrink-0 tabular-nums">
              {metaShownLabel(count.shown, count.total, DECK_NOUN)}
            </span>
          )}
        </PageTopBar>
      </PageTopBarSticky>
      <div className={cn(PAGE_WIDTH.full, "px-safe pt-3 pb-6")}>
        <PageDescription className="pb-4">{META_DECKS_DESCRIPTION}</PageDescription>

        {hydrated ? (
          <Suspense fallback={<MetaDeckBrowserFallback />}>
            <MetaDeckBrowser onCount={onCount} />
          </Suspense>
        ) : (
          <MetaDeckBrowserFallback />
        )}
      </div>
    </div>
  );
}

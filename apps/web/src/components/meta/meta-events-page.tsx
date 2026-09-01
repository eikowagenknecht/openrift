import type { MetaEventSummary } from "@openrift/shared";
import { getRouteApi } from "@tanstack/react-router";
import { ChevronDownIcon, ChevronUpIcon, TrophyIcon } from "lucide-react";
import { useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { SearchInput } from "@/components/filters/search-input";
import {
  PageDescription,
  PageTopBar,
  PageTopBarBack,
  PageTopBarSticky,
  PageTopBarTitle,
} from "@/components/layout/page-top-bar";
import { META_EVENTS_DESCRIPTION } from "@/components/meta/meta-copy";
import { EVENT_INDEX_GRID, MetaEventIndexRow } from "@/components/meta/meta-event-index-row";
import { MetaScopeBar } from "@/components/meta/meta-scope-bar";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import { Pressable } from "@/components/ui/pressable";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMetaEvents } from "@/hooks/use-meta";
import { useMetaEras } from "@/hooks/use-meta-eras";
import { useSearchUrlSync } from "@/hooks/use-search-url-sync";
import {
  filterMetaEvents,
  metaEventCountries,
  nextEventSort,
  sortMetaEvents,
} from "@/lib/meta-events-index";
import type {
  MetaEventHoldings,
  MetaEventIndexSort,
  MetaEventIndexSortDirection,
} from "@/lib/meta-events-search";
import {
  DEFAULT_EVENT_DIRECTION,
  DEFAULT_EVENT_SORT,
  META_EVENT_HOLDINGS,
} from "@/lib/meta-events-search";
import { metaShownLabel } from "@/lib/meta-format";
import type { MetaScope } from "@/lib/meta-scope";
import { CLEARED_SCOPE, nextScopeSearch, scopeKey } from "@/lib/meta-scope";
import { cn, PAGE_WIDTH } from "@/lib/utils";

const routeApi = getRouteApi("/_app/meta_/events");

/** How many rows the page opens with, and how many each "more" adds. */
const PAGE_SIZE = 50;

/** The holdings control's "no narrowing" option. An empty string clears the param. */
const ANY_HOLDINGS = "";

/**
 * `/meta/events` — every archived tournament as one row: when and where it ran,
 * how much it counted for, how much of it the archive holds, and who won it.
 *
 * The whole archive ships as one payload (ADR-014), so the search box, the scope
 * bar and the column sort all run client-side and the count under the title is
 * always the truth about what is on screen.
 */
export function MetaEventsPage() {
  const search = routeApi.useSearch();
  const navigate = routeApi.useNavigate();
  const { data } = useMetaEvents();
  const eras = useMetaEras();

  const sort = search.by ?? DEFAULT_EVENT_SORT;
  const direction = search.dir ?? DEFAULT_EVENT_DIRECTION;

  const setSearchParams = (patch: Record<string, unknown>) => {
    void navigate({ search: (prev) => nextScopeSearch(prev, patch), replace: true });
  };

  const setScope = (patch: Partial<MetaScope>) => setSearchParams(patch);
  const clearScope = () => setSearchParams({ ...CLEARED_SCOPE, q: undefined, holds: undefined });
  const setSort = (column: MetaEventIndexSort) => {
    const next = nextEventSort({ sort, direction }, column);
    setSearchParams({ by: next.sort, dir: next.direction });
  };
  const commitQuery = (value: string) => setSearchParams({ q: value === "" ? undefined : value });

  const all = data.events;
  const events = sortMetaEvents(
    filterMetaEvents(all, { query: search.q, scope: search, eras, holds: search.holds }),
    sort,
    direction,
  );
  const countries = metaEventCountries(all);
  // Reordering is not renarrowing: the same events in a new order stay expanded,
  // so the sort keys are deliberately absent here.
  const listKey = `${search.q ?? ""}|${search.holds ?? ""}|${scopeKey(search)}`;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageTopBarSticky width="capped">
        <PageTopBar>
          <PageTopBarBack to="/meta" aria-label="Meta archive" />
          <PageTopBarTitle>Tournaments</PageTopBarTitle>
          <span className="text-muted-foreground shrink-0 tabular-nums">
            {metaShownLabel(events.length, all.length, {
              singular: "archived event",
              plural: "archived events",
            })}
          </span>
        </PageTopBar>
      </PageTopBarSticky>

      <div className={cn(PAGE_WIDTH.capped, "px-safe pt-3 pb-6")}>
        <PageDescription className="pb-4">{META_EVENTS_DESCRIPTION}</PageDescription>

        {all.length === 0 ? (
          <EmptyState
            className="py-12"
            icon={TrophyIcon}
            title="No tournaments archived yet"
            description="Standings and decklists land here as soon as an event is entered."
          />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <EventSearchBox urlValue={search.q ?? ""} onCommit={commitQuery} />
              <MetaScopeBar
                scope={search}
                setScope={setScope}
                clearScope={clearScope}
                eras={eras}
                countries={countries}
                extras={
                  <HoldingsSelect
                    value={search.holds}
                    onChange={(holds) => setSearchParams({ holds })}
                  />
                }
                extrasActive={search.holds !== undefined}
              />
            </div>

            <div className="bg-card ring-foreground/10 mt-4 overflow-hidden rounded-lg ring-1">
              <SortHeader sort={sort} direction={direction} onSort={setSort} />
              {events.length === 0 ? (
                <Empty className="py-10">
                  <EmptyHeader>
                    <EmptyDescription>No events match these filters.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <EventList key={listKey} events={events} />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** What the holdings control offers, in the words the index uses for the columns. */
const HOLDINGS_ITEMS: Record<string, string> = {
  [ANY_HOLDINGS]: "Any events",
  decks: "With decklists",
  standings: "With standings",
};

/**
 * How much of an event the archive must already hold. An index of every event
 * is mostly dates with nothing behind them yet, and a reader after decklists
 * would otherwise open each row to find that out.
 */
function HoldingsSelect({
  value,
  onChange,
}: {
  value: MetaEventHoldings | undefined;
  onChange: (value: MetaEventHoldings | undefined) => void;
}) {
  return (
    <Select
      value={value ?? ANY_HOLDINGS}
      onValueChange={(next) => {
        const chosen = (next as string | null) ?? ANY_HOLDINGS;
        onChange(META_EVENT_HOLDINGS.find((entry) => entry === chosen));
      }}
      items={HOLDINGS_ITEMS}
    >
      <SelectTrigger className="w-40" aria-label="Archive holdings">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(HOLDINGS_ITEMS).map(([itemValue, label]) => (
          <SelectItem key={itemValue} value={itemValue}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * The search box, holding the typed value itself so a keystroke re-renders one
 * input rather than the whole list behind it. The debounced value commits to
 * the URL, which is what the filtering reads.
 */
function EventSearchBox({
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
      placeholder="Search events, venues, organizers"
    />
  );
}

/**
 * The rows, opened at {@link PAGE_SIZE} and extended a page at a time. Remounted
 * whenever the filters change (its `key`), so a narrowed view always starts at
 * the top of its own list rather than at whatever depth the previous one reached.
 */
function EventList({ events }: { events: MetaEventSummary[] }) {
  const [shown, setShown] = useState(PAGE_SIZE);
  const remaining = events.length - shown;

  return (
    <>
      <ul className="divide-border flex flex-col divide-y">
        {events.slice(0, shown).map((event) => (
          <li key={event.id}>
            <MetaEventIndexRow event={event} />
          </li>
        ))}
      </ul>
      {remaining > 0 && (
        <div className="border-border flex justify-center border-t p-2">
          <Button variant="ghost" size="sm" onClick={() => setShown(shown + PAGE_SIZE)}>
            {remaining.toLocaleString()} more {remaining === 1 ? "event" : "events"}
          </Button>
        </div>
      )}
    </>
  );
}

/**
 * The column labels, each a sort control. Hidden on phones, where the rows are
 * cards rather than columns and there is nothing for a header to label.
 */
function SortHeader({
  sort,
  direction,
  onSort,
}: {
  sort: MetaEventIndexSort;
  direction: MetaEventIndexSortDirection;
  onSort: (column: MetaEventIndexSort) => void;
}) {
  return (
    <div
      className={cn(
        EVENT_INDEX_GRID,
        "border-border text-muted-foreground hidden border-b px-4 py-2 text-xs font-semibold sm:grid",
      )}
    >
      <SortButton column="date" sort={sort} direction={direction} onSort={onSort}>
        Date
      </SortButton>
      <SortButton column="name" sort={sort} direction={direction} onSort={onSort}>
        Event
      </SortButton>
      <SortButton column="tier" sort={sort} direction={direction} onSort={onSort}>
        Tier
      </SortButton>
      <SortButton column="country" sort={sort} direction={direction} onSort={onSort}>
        Country
      </SortButton>
      <SortButton column="players" sort={sort} direction={direction} onSort={onSort} align="end">
        Players
      </SortButton>
      <SortButton column="decks" sort={sort} direction={direction} onSort={onSort} align="end">
        Decks
      </SortButton>
      <span>Winner</span>
    </div>
  );
}

function SortButton({
  column,
  sort,
  direction,
  onSort,
  align = "start",
  children,
}: {
  column: MetaEventIndexSort;
  sort: MetaEventIndexSort;
  direction: MetaEventIndexSortDirection;
  onSort: (column: MetaEventIndexSort) => void;
  align?: "start" | "end";
  children: string;
}) {
  const active = sort === column;
  const Arrow = direction === "asc" ? ChevronUpIcon : ChevronDownIcon;
  const order = direction === "asc" ? "ascending" : "descending";
  return (
    <Pressable
      className={cn(
        "hover:text-foreground flex min-w-0 items-center gap-1 rounded-xs",
        active && "text-foreground",
        align === "end" && "justify-end",
      )}
      aria-label={active ? `${children}, sorted ${order}` : `Sort by ${children.toLowerCase()}`}
      onClick={() => onSort(column)}
    >
      <span className="truncate">{children}</span>
      {active && <Arrow className="size-3 shrink-0" />}
    </Pressable>
  );
}

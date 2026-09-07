import type { MetaEventSummary } from "@openrift/shared/types/api/meta";
import { getRouteApi } from "@tanstack/react-router";
import { TrophyIcon } from "lucide-react";
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
import { IndexSortButton } from "@/components/meta/meta-index-sort-button";
import { MetaScopeBar } from "@/components/meta/meta-scope-bar";
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
import { useMetaCounts, useMetaEvents } from "@/hooks/use-meta";
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
import { CLEARED_SCOPE, nextScopeSearch, resolveScopeRange, scopeKey } from "@/lib/meta-scope";
import { cn, PAGE_WIDTH } from "@/lib/utils";

const routeApi = getRouteApi("/_app/meta_/events");

const PAGE_SIZE = 50;

const ANY_HOLDINGS = "";

export function MetaEventsPage() {
  const search = routeApi.useSearch();
  const navigate = routeApi.useNavigate();
  const eras = useMetaEras();
  const { data } = useMetaEvents(resolveScopeRange(search, eras));
  const { data: counts } = useMetaCounts();

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

  const fetched = data.events;
  const events = sortMetaEvents(
    filterMetaEvents(fetched, { query: search.q, scope: search, eras, holds: search.holds }),
    sort,
    direction,
  );
  const countries = metaEventCountries(fetched);
  // Sort keys are deliberately absent: reordering keeps the same rows expanded.
  const listKey = `${search.q ?? ""}|${search.holds ?? ""}|${scopeKey(search)}`;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageTopBarSticky width="capped">
        <PageTopBar>
          <PageTopBarBack to="/meta" aria-label="Meta archive" />
          <PageTopBarTitle>Events</PageTopBarTitle>
          <span className="text-muted-foreground shrink-0 tabular-nums">
            {metaShownLabel(events.length, counts.totalEvents, {
              singular: "archived event",
              plural: "archived events",
            })}
          </span>
        </PageTopBar>
      </PageTopBarSticky>

      <div className={cn(PAGE_WIDTH.capped, "px-safe pt-3 pb-6")}>
        <PageDescription className="pb-4">{META_EVENTS_DESCRIPTION}</PageDescription>

        {counts.totalEvents === 0 ? (
          <EmptyState
            className="py-12"
            icon={TrophyIcon}
            title="No events archived yet"
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

            <Card className="mt-4 gap-0 py-0">
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
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

const HOLDINGS_ITEMS: Record<string, string> = {
  [ANY_HOLDINGS]: "Any events",
  decks: "With decklists",
  standings: "With standings",
  upcoming: "Upcoming",
};

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

const SortButton = IndexSortButton<MetaEventIndexSort>;

import { Suspense, useState } from "react";

import {
  PageDescription,
  PageTopBar,
  PageTopBarBack,
  PageTopBarSticky,
  PageTopBarTitle,
} from "@/components/layout/page-top-bar";
import { META_DECKS_DESCRIPTION } from "@/components/meta/meta-copy";
import { MetaDeckCostsBridge } from "@/components/meta/meta-deck-costs-bridge";
import { MetaDeckEventSection } from "@/components/meta/meta-deck-event-section";
import {
  MetaDeckActiveFilters,
  MetaDeckFilterControls,
} from "@/components/meta/meta-deck-filter-controls";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
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
  groupMetaDecksByEvent,
  metaDeckFilterCounts,
  metaDeckFilterOptions,
  sortMetaDecks,
} from "@/lib/meta-deck-filters";
import { cn, PAGE_WIDTH } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";

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

/**
 * `/meta/decks` — the cross-event deck browser. The endpoint hands over the
 * whole archive and every filter runs client-side (ADR-014), so narrowing is
 * instant and one cacheable payload serves every view.
 */
export function MetaDeckBrowserPage() {
  const { data } = useMetaDecks();
  const { data: eventsData } = useMetaEvents();
  const filters = useMetaDeckFilters();
  const eras = useMetaEras();
  const hydrated = useHydrated();
  const { data: session } = useSession();
  const marketplace = useDisplayStore((state) => state.marketplaceOrder[0] ?? "cardtrader");
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
  const decks = sortMetaDecks(curateMetaDecks(matching, values));
  const groups = groupMetaDecksByEvent(decks);
  const summaries = new Map(eventsData.events.map((event) => [event.slug, event]));

  const cost = {
    ready: costs !== undefined,
    withCollection: signedIn,
    countUnderCost: (maxCost: number | null) =>
      countMetaDecksUnderCost(data.decks, values, context, maxCost),
    maxToComplete: highest(costs, (entry) => entry.toComplete),
    maxValue: highest(costs, (entry) => entry.value),
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {hydrated && (
        <Suspense fallback={null}>
          <MetaDeckCostsBridge
            includeSideboard={filters.includeSideboard}
            withCollection={signedIn}
            onChange={setCosts}
          />
        </Suspense>
      )}

      <PageTopBarSticky width="full">
        <PageTopBar>
          <PageTopBarBack to="/meta" aria-label="Meta archive" />
          <PageTopBarTitle>Archived decks</PageTopBarTitle>
        </PageTopBar>
      </PageTopBarSticky>
      <div className={cn(PAGE_WIDTH.full, "px-safe pt-3 pb-6")}>
        <PageDescription className="pb-4">{META_DECKS_DESCRIPTION}</PageDescription>

        <div className="flex flex-col gap-3">
          <MetaDeckFilterControls options={options} counts={counts} eras={eras} cost={cost} />
          <MetaDeckActiveFilters options={options} eras={eras} withCollection={signedIn} />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
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
            {decks.length} {decks.length === 1 ? "deck" : "decks"} · {groups.length}{" "}
            {groups.length === 1 ? "event" : "events"}
          </p>
        </div>

        {groups.length === 0 ? (
          <Empty className="mt-6">
            <EmptyHeader>
              <EmptyDescription>No decks match these filters.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="mt-6 flex flex-col gap-8">
            {groups.map((group) => (
              <MetaDeckEventSection
                key={group.event.slug}
                event={group.event}
                summary={summaries.get(group.event.slug)}
                decks={group.decks}
                costs={costs}
                marketplace={marketplace}
                defaultExpanded={groups.length === 1}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

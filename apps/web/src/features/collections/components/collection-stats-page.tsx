import { getAvailableFilters } from "@openrift/shared/filters-available";
import { use, useDeferredValue, useState } from "react";
import { createPortal } from "react-dom";

import { PageTopBar, PageTopBarTitle } from "@/components/layout/page-top-bar";
import { TopBarSlotContext } from "@/components/layout/top-bar-slot";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useSidebar } from "@/components/ui/sidebar";
import { CompactFilterBar } from "@/features/cards/components/compact-filter-bar";
import { usePrices } from "@/features/cards/hooks/use-prices";
import { resolveTopLevelUnits } from "@/features/cards/lib/filter-sections";
import { CompletionSection } from "@/features/collections/components/collection-completion-section";
import {
  DomainDistributionChart,
  RarityDistributionChart,
  TypeDistributionChart,
} from "@/features/collections/components/collection-distribution-charts";
import { MostExpensivePrintings } from "@/features/collections/components/collection-expensive-printings";
import { StatsHeroStats } from "@/features/collections/components/collection-stats-hero";
import {
  StatsEmptyState,
  StatsSkeleton,
} from "@/features/collections/components/collection-stats-placeholders";
import { CollectionStatsToolbar } from "@/features/collections/components/collection-stats-toolbar";
import { CollectionValueChart } from "@/features/collections/components/collection-value-chart";
import { CostToCompleteChart } from "@/features/collections/components/cost-to-complete-chart";
import { useCollectionStats } from "@/features/collections/hooks/use-collection-stats";
import {
  HIDDEN_FILTER_SECTIONS,
  useScopeFromFilters,
} from "@/features/collections/hooks/use-stats-scope";
import type { CompletionCountMode, CompletionGroupBy } from "@/features/collections/lib/stat-types";
import { EnergyPowerChart } from "@/features/decks/components/stats/energy-power-chart";
import { useEnumOrders } from "@/hooks/use-enums";
import { useFeatureEnabled } from "@/hooks/use-feature-flags";
import { cn, PAGE_WIDTH } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";

export function CollectionStatsPage() {
  const { toggleSidebar } = useSidebar();
  const topBarSlot = use(TopBarSlotContext);
  const [collectionScope, setCollectionScope] = useState("all");
  const collectionId = collectionScope === "all" ? undefined : collectionScope;
  // Deferred so the chip paints on the urgent render while the five charts
  // recompute; safe only because `scope` stays identity-stable per URL state.
  const liveScope = useScopeFromFilters();
  const scope = useDeferredValue(liveScope);
  const stats = useCollectionStats(collectionId, scope);
  const priceHistoryEnabled = useFeatureEnabled("price-history");
  const { orders } = useEnumOrders();

  const [groupBy, setGroupBy] = useState<CompletionGroupBy>("set");
  const [countMode, setCountMode] = useState<CompletionCountMode>("cards");
  const topLevelFilters = useDisplayStore((state) => state.topLevelFilters);
  const topLevelUnits = resolveTopLevelUnits(topLevelFilters);
  const prices = usePrices();

  const slugToName = new Map(stats.sets.map((set) => [set.slug, set.name]));
  const setDisplayLabel = (slug: string) => slugToName.get(slug) ?? slug;

  const availableLanguages = [...new Set(stats.allPrintings.map((printing) => printing.language))];

  const availableFilters = getAvailableFilters(stats.allPrintings, { orders, sets: stats.sets });

  const topBarPortal =
    topBarSlot &&
    createPortal(
      <PageTopBar>
        <PageTopBarTitle onToggleSidebar={toggleSidebar}>Statistics</PageTopBarTitle>
      </PageTopBar>,
      topBarSlot,
    );

  return (
    <div className={cn(PAGE_WIDTH.capped, "pt-3")}>
      {topBarPortal}

      <CollectionStatsToolbar
        collectionScope={collectionScope}
        onCollectionScopeChange={setCollectionScope}
        groupBy={groupBy}
        onGroupByChange={setGroupBy}
        countMode={countMode}
        onCountModeChange={setCountMode}
      />
      {/* `flex` unhides the bar below sm: this page has no mobile filter
          drawer, so the chips just wrap there. */}
      <CompactFilterBar
        className="flex"
        availableFilters={availableFilters}
        availableLanguages={availableLanguages}
        setDisplayLabel={setDisplayLabel}
        hiddenSections={HIDDEN_FILTER_SECTIONS}
        topLevelUnits={topLevelUnits}
      />

      {stats.isReady ? (
        stats.totalCopies === 0 ? (
          <StatsEmptyState />
        ) : (
          <div className="space-y-6">
            <section className="space-y-4">
              <h2 className="text-base font-semibold">Completion</h2>
              <CompletionSection
                stats={stats}
                groupBy={groupBy}
                countMode={countMode}
                scope={scope}
              />
            </section>

            <Separator />

            <section className="space-y-4">
              <h2 className="text-base font-semibold">Cost to Complete</h2>
              <CostToCompleteChart
                allPrintings={stats.allPrintings}
                stacks={stats.stacks}
                scope={scope}
                customTagAssignments={stats.customTagAssignments}
                countMode={countMode}
                prices={prices}
                marketplace={stats.marketplace}
              />
            </section>

            {priceHistoryEnabled && (
              <>
                <Separator />

                <section className="space-y-4">
                  <h2 className="text-base font-semibold">Value Over Time</h2>
                  <Card>
                    <CardContent className="pt-6">
                      <CollectionValueChart collectionId={collectionId} scope={scope} />
                    </CardContent>
                  </Card>
                </section>
              </>
            )}

            <Separator />

            <section className="space-y-4">
              <h2 className="text-base font-semibold">Stats</h2>
              <StatsHeroStats stats={stats} />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Card>
                  <CardHeader>
                    <CardTitle>Domain</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <DomainDistributionChart data={stats.domainDistribution} />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Rarity</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <RarityDistributionChart data={stats.rarityDistribution} />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Type</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <TypeDistributionChart data={stats.typeBreakdown} />
                  </CardContent>
                </Card>
              </div>
              <MostExpensivePrintings
                printings={stats.mostExpensivePrintings}
                formatPrice={stats.formatPrice}
              />

              {(stats.energyCurve.length > 0 || stats.powerCurve.length > 0) && (
                <Card>
                  <CardHeader>
                    <CardTitle>Energy &amp; Power</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <EnergyPowerChart
                      energyData={stats.energyCurve}
                      energyStacks={stats.energyCurveStacks}
                      averageEnergy={stats.averageEnergy}
                      powerData={stats.powerCurve}
                      powerStacks={stats.powerCurveStacks}
                      averagePower={stats.averagePower}
                      singleColor
                    />
                  </CardContent>
                </Card>
              )}
            </section>
          </div>
        )
      ) : (
        <StatsSkeleton />
      )}
    </div>
  );
}

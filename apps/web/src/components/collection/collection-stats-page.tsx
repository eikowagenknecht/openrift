import type { CompletionScopePreference, Domain } from "@openrift/shared";
import { getAvailableFilters } from "@openrift/shared";
import { Link, Navigate } from "@tanstack/react-router";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChartBarIcon,
  CoinsIcon,
  CopyIcon,
  ExternalLinkIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  SquareIcon,
  SquareStackIcon,
} from "lucide-react";
import { use, useState } from "react";
import { createPortal } from "react-dom";

import { CardIcon } from "@/components/card-icon";
import { CostToCompleteChart } from "@/components/collection/cost-to-complete-chart";
import { EnergyPowerChart } from "@/components/deck/stats/energy-power-chart";
import { TypeBreakdown } from "@/components/deck/stats/type-breakdown";
import { ActiveFilters } from "@/components/filters/active-filters";
import { FilterBadgeSections } from "@/components/filters/filter-panel-content";
import { PageTopBar, PageTopBarTitle } from "@/components/layout/page-top-bar";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useSidebar } from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useFilterValues } from "@/hooks/use-card-filters";
import type {
  CollectionStats,
  CollectionStatsResult,
  CompletionCountMode,
  CompletionEntry,
  CompletionGroupBy,
  PricedCard,
} from "@/hooks/use-collection-stats";
import { computeCompletion, filterByScope, useCollectionStats } from "@/hooks/use-collection-stats";
import { useCollections } from "@/hooks/use-collections";
import { useDomainColors } from "@/hooks/use-domain-colors";
import { useEnumOrders } from "@/hooks/use-enums";
import { useFeatureEnabled } from "@/hooks/use-feature-flags";
import { usePrices } from "@/hooks/use-prices";
import { getDomainColor } from "@/lib/domain";
import { getFilterIconPath } from "@/lib/icons";
import { MARKETPLACE_META } from "@/lib/marketplace-meta";
import type { DomainCount } from "@/lib/stat-types";
import { cn } from "@/lib/utils";
import { TopBarSlotContext } from "@/routes/_app/_authenticated/collections/route";

// ── Hero Stats ─────────────────────────────────────────────────────────────

function StatsHeroStats({ stats }: { stats: CollectionStats }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-muted-foreground flex items-center gap-1.5">
            <SquareIcon className="size-4" />
            Unique Cards
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold tabular-nums">
            {stats.uniqueCards.toLocaleString()}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-muted-foreground flex items-center gap-1.5">
            <CopyIcon className="size-4" />
            Unique Printings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold tabular-nums">
            {stats.uniquePrintings.toLocaleString()}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-muted-foreground flex items-center gap-1.5">
            <SquareStackIcon className="size-4" />
            Total Copies
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold tabular-nums">
            {stats.totalCopies.toLocaleString()}
          </p>
        </CardContent>
      </Card>
      <a
        href={MARKETPLACE_META[stats.marketplace].searchUrl("riftbound")}
        target="_blank"
        rel="noreferrer"
        className="no-underline"
      >
        <Card className="hover:bg-muted/50 h-full transition-colors">
          <CardHeader>
            <CardTitle className="text-muted-foreground flex items-center gap-1.5">
              <CoinsIcon className="size-4" />
              Estimated Value
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">
              {stats.formatPrice(stats.estimatedValue)}
            </p>
            <p className="text-muted-foreground flex items-center gap-1 text-xs">
              <img
                src={MARKETPLACE_META[stats.marketplace].icon}
                alt=""
                className="h-3 invert dark:invert-0"
              />
              {MARKETPLACE_META[stats.marketplace].label}
              {stats.unpricedCount > 0 && (
                <span>
                  &middot; {stats.unpricedCount} {stats.unpricedCount === 1 ? "copy" : "copies"}{" "}
                  unpriced
                </span>
              )}
            </p>
          </CardContent>
        </Card>
      </a>
    </div>
  );
}

// ── Scope from URL filters ────────────────────────────────────────────────

const HIDDEN_FILTER_SECTIONS = new Set(["owned", "superTypes"]);

/**
 * Builds a CompletionScopePreference from the standard URL filter state.
 * @returns A scope object for filterByScope / computeCompletion.
 */
function useScopeFromFilters(): CompletionScopePreference {
  const { filters } = useFilterValues();
  const scope: CompletionScopePreference = {};
  if (filters.sets.length > 0) {
    scope.sets = filters.sets;
  }
  if (filters.languages.length > 0) {
    scope.languages = filters.languages;
  }
  if (filters.domains.length > 0) {
    scope.domains = filters.domains;
  }
  if (filters.types.length > 0) {
    scope.types = filters.types;
  }
  if (filters.rarities.length > 0) {
    scope.rarities = filters.rarities;
  }
  if (filters.finishes.length > 0) {
    scope.finishes = filters.finishes;
  }
  if (filters.artVariants.length > 0) {
    scope.artVariants = filters.artVariants;
  }
  if (filters.isPromo === true) {
    scope.promos = "only";
  } else if (filters.isPromo === false) {
    scope.promos = "exclude";
  }
  if (filters.isSigned !== null) {
    scope.signed = filters.isSigned;
  }
  if (filters.isBanned !== null) {
    scope.banned = filters.isBanned;
  }
  if (filters.hasErrata !== null) {
    scope.errata = filters.hasErrata;
  }
  return scope;
}

// ── Completion Section ─────────────────────────────────────────────────────

const GROUP_BY_OPTIONS: { value: CompletionGroupBy; label: string }[] = [
  { value: "set", label: "Set" },
  { value: "domain", label: "Domain" },
  { value: "rarity", label: "Rarity" },
  { value: "type", label: "Type" },
];

const COUNT_MODE_OPTIONS: { value: CompletionCountMode; label: string; tooltip: string }[] = [
  { value: "cards", label: "Cards", tooltip: "One of each unique card" },
  { value: "printings", label: "Printings", tooltip: "Every printing variant" },
  {
    value: "copies",
    label: "Copies",
    tooltip: "Playset quantities (3x, 1x for Legends/Battlefields)",
  },
];

function CompletionTotalRow({ entries }: { entries: CompletionEntry[] }) {
  const totalOwned = entries.reduce((sum, entry) => sum + entry.owned, 0);
  const totalAll = entries.reduce((sum, entry) => sum + entry.total, 0);
  const percent = totalAll > 0 ? (totalOwned / totalAll) * 100 : 0;

  return (
    <div className="bg-muted/50 -mx-2 flex items-center gap-3 rounded-md px-2 py-1.5">
      <span className="flex w-36 shrink-0 items-center text-sm font-semibold sm:w-48">Overall</span>
      <div className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
        <div
          className="bg-primary h-full rounded-full transition-all"
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
      <span className="text-muted-foreground w-20 shrink-0 text-right text-xs tabular-nums">
        {totalOwned.toLocaleString()} / {totalAll.toLocaleString()}
      </span>
      <span className="w-12 shrink-0 text-right text-xs font-semibold tabular-nums">
        {percent.toFixed(1)}%
      </span>
      <span className="w-3.5 shrink-0" />
    </div>
  );
}

function CompletionRow({
  entry,
  icon,
  barColor,
  missingHref,
}: {
  entry: CompletionEntry;
  icon?: string;
  barColor?: string;
  missingHref?: string;
}) {
  const missing = entry.total - entry.owned;

  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="flex w-36 shrink-0 items-center gap-1.5 truncate text-sm font-medium sm:w-48">
        {icon && <CardIcon src={icon} className="size-4 shrink-0" />}
        {entry.label}
      </span>
      <div className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
        <div
          className={cn("h-full rounded-full transition-all", !barColor && "bg-primary")}
          style={{
            width: `${Math.min(entry.percent, 100)}%`,
            ...(barColor ? { backgroundColor: barColor } : {}),
          }}
        />
      </div>
      <span className="text-muted-foreground w-20 shrink-0 text-right text-xs tabular-nums">
        {entry.owned} / {entry.total}
      </span>
      <span className="w-12 shrink-0 text-right text-xs font-medium tabular-nums">
        {entry.percent.toFixed(0)}%
      </span>
      {missingHref ? (
        <a
          href={missingHref}
          title={`Browse ${missing} missing`}
          className={cn(
            "shrink-0",
            missing > 0
              ? "text-muted-foreground hover:text-foreground"
              : "pointer-events-none invisible",
          )}
          tabIndex={missing > 0 ? undefined : -1}
        >
          <ExternalLinkIcon className="size-3.5" />
        </a>
      ) : (
        <span className="w-3.5 shrink-0" />
      )}
    </div>
  );
}

function getRowIcon(groupBy: CompletionGroupBy, key: string): string | undefined {
  switch (groupBy) {
    case "domain": {
      return getFilterIconPath("domains", key);
    }
    case "rarity": {
      return getFilterIconPath("rarities", key);
    }
    case "type": {
      return getFilterIconPath("types", key);
    }
    default: {
      return undefined;
    }
  }
}

function CompletionSection({
  stats,
  groupBy,
  countMode,
  scope,
}: {
  stats: CollectionStatsResult;
  groupBy: CompletionGroupBy;
  countMode: CompletionCountMode;
  scope: CompletionScopePreference;
}) {
  const domainColors = useDomainColors();
  const { rarityColors } = useEnumOrders();

  const scopedPrintings = filterByScope(stats.allPrintings, scope);

  const entries = computeCompletion({
    stacks: stats.stacks,
    scopedPrintings,
    scope,
    sets: stats.sets,
    groupBy,
    countMode,
    orders: stats.orders,
  });

  // For set grouping, split main/supplemental
  const mainEntries =
    groupBy === "set" ? entries.filter((entry) => entry.setType === "main") : entries;
  const supplementalEntries =
    groupBy === "set" ? entries.filter((entry) => entry.setType === "supplemental") : [];

  function rowBarColor(key: string): string | undefined {
    if (groupBy === "domain") {
      return getDomainColor(key as Domain, domainColors);
    }
    if (groupBy === "rarity") {
      return rarityColors[key];
    }
    return undefined;
  }

  // Build URL search params for "View missing" link per completion row.
  // Only available in "cards" count mode (the card browser filters at the card level).
  const setIdToSlug = new Map(stats.sets.map((set) => [set.id, set.slug]));

  function missingHref(key: string): string | undefined {
    if (countMode !== "cards") {
      return undefined;
    }
    const params = new URLSearchParams();
    params.set("owned", "false");
    switch (groupBy) {
      case "set": {
        const slug = setIdToSlug.get(key);
        if (slug) {
          params.set("sets", slug);
        }
        break;
      }
      case "domain": {
        params.set("domains", key);
        break;
      }
      case "rarity": {
        params.set("rarities", key);
        break;
      }
      case "type": {
        params.set("types", key);
        break;
      }
    }
    // Pass scope filters so the card browser matches the completion view
    const arrayFields = [
      ["sets", scope.sets],
      ["languages", scope.languages],
      ["domains", scope.domains],
      ["types", scope.types],
      ["rarities", scope.rarities],
      ["finishes", scope.finishes],
      ["artVariants", scope.artVariants],
    ] as const;
    for (const [paramName, values] of arrayFields) {
      if (values && values.length > 0) {
        params.set(paramName, values.join(","));
      }
    }
    if (scope.promos === "only") {
      params.set("promo", "true");
    } else if (scope.promos === "exclude") {
      params.set("promo", "false");
    }
    if (scope.signed !== undefined) {
      params.set("signed", String(scope.signed));
    }
    if (scope.banned !== undefined) {
      params.set("banned", String(scope.banned));
    }
    if (scope.errata !== undefined) {
      params.set("errata", String(scope.errata));
    }
    return `/cards?${params.toString()}`;
  }

  return (
    <section>
      <CompletionTotalRow entries={entries} />

      {mainEntries.length === 0 && supplementalEntries.length === 0 ? (
        <p className="text-muted-foreground py-4 text-center text-sm">No data</p>
      ) : (
        <>
          <div>
            {mainEntries.map((entry) => (
              <CompletionRow
                key={entry.key}
                entry={entry}
                icon={getRowIcon(groupBy, entry.key)}
                barColor={rowBarColor(entry.key)}
                missingHref={missingHref(entry.key)}
              />
            ))}
          </div>
          {supplementalEntries.length > 0 && (
            <div className="mt-3">
              <h4 className="text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase">
                Supplemental
              </h4>
              {supplementalEntries.map((entry) => (
                <CompletionRow
                  key={entry.key}
                  entry={entry}
                  icon={getRowIcon(groupBy, entry.key)}
                  barColor={rowBarColor(entry.key)}
                  missingHref={missingHref(entry.key)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

// ── Domain Distribution ────────────────────────────────────────────────────

function DomainDistribution({ data, totalCopies }: { data: DomainCount[]; totalCopies: number }) {
  const domainColors = useDomainColors();

  if (data.length === 0) {
    return null;
  }

  return (
    <div>
      <TooltipProvider>
        <div className="mb-3 flex h-4 overflow-hidden rounded-full">
          {data.map((entry) => {
            if (entry.count === 0) {
              return null;
            }
            const percentage = (entry.count / totalCopies) * 100;
            return (
              <Tooltip key={entry.domain}>
                <TooltipTrigger
                  className="h-full"
                  render={<span />}
                  style={{
                    width: `${percentage}%`,
                    backgroundColor: getDomainColor(entry.domain, domainColors),
                  }}
                />
                <TooltipContent side="bottom">
                  {entry.domain}: {entry.count} ({percentage.toFixed(1)}%)
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </TooltipProvider>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3 md:grid-cols-4">
        {data.map((entry) => {
          const percentage = totalCopies > 0 ? (entry.count / totalCopies) * 100 : 0;
          return (
            <div key={entry.domain} className="flex items-center gap-2 text-sm">
              <span
                className="size-3 shrink-0 rounded-sm"
                style={{ backgroundColor: getDomainColor(entry.domain, domainColors) }}
              />
              <span className="flex-1">{entry.domain}</span>
              <span className="text-muted-foreground tabular-nums">{entry.count}</span>
              <span className="text-muted-foreground w-10 text-right text-xs tabular-nums">
                {percentage.toFixed(0)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Price Extremes ────────────────────────────────────────────────────────

function PriceExtremes({
  cheapest,
  mostExpensive,
  formatPrice,
}: {
  cheapest: PricedCard | null;
  mostExpensive: PricedCard | null;
  formatPrice: (value?: number | null) => string;
}) {
  if (!cheapest && !mostExpensive) {
    return null;
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {cheapest && (
        <Link
          to="/cards/$cardSlug"
          params={{ cardSlug: cheapest.cardSlug }}
          className="block no-underline"
        >
          <Card className="hover:bg-muted/50 transition-colors">
            <CardHeader>
              <CardTitle className="text-muted-foreground flex items-center gap-1.5">
                <ArrowDownIcon className="size-4" />
                Cheapest Printing
              </CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-3">
              {cheapest.thumbnail && (
                <img src={cheapest.thumbnail} alt="" className="h-16 w-auto shrink-0 rounded" />
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{cheapest.name}</p>
                <p className="text-muted-foreground text-xs tabular-nums">
                  {formatPrice(cheapest.price)}
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>
      )}
      {mostExpensive && (
        <Link
          to="/cards/$cardSlug"
          params={{ cardSlug: mostExpensive.cardSlug }}
          className="block no-underline"
        >
          <Card className="hover:bg-muted/50 transition-colors">
            <CardHeader>
              <CardTitle className="text-muted-foreground flex items-center gap-1.5">
                <ArrowUpIcon className="size-4" />
                Most Expensive Printing
              </CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-3">
              {mostExpensive.thumbnail && (
                <img
                  src={mostExpensive.thumbnail}
                  alt=""
                  className="h-16 w-auto shrink-0 rounded"
                />
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{mostExpensive.name}</p>
                <p className="text-muted-foreground text-xs tabular-nums">
                  {formatPrice(mostExpensive.price)}
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>
      )}
    </div>
  );
}

// ── Empty State ────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 py-20 text-center">
      <ChartBarIcon className="text-muted-foreground size-12" />
      <div>
        <p className="font-medium">No cards in collection yet</p>
        <p className="text-muted-foreground mt-1 max-w-xs text-sm">
          Browse the catalog and add cards to see statistics about your collection.
        </p>
      </div>
      <div className="mt-2 flex gap-2">
        <Button variant="default" render={<Link to="/cards" />}>
          <SearchIcon className="size-3.5" />
          Browse cards
        </Button>
      </div>
    </div>
  );
}

// ── Collection Selector ────────────────────────────────────────────────────

function CollectionSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { data: collections } = useCollections();

  return (
    <Select
      value={value}
      onValueChange={(newValue) => onChange(newValue ?? "all")}
      items={{
        all: "All collections",
        ...Object.fromEntries(collections?.map((col) => [col.id, col.name]) ?? []),
      }}
    >
      <SelectTrigger className="w-auto" aria-label="Collection scope">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All collections</SelectItem>
        {collections?.map((col) => (
          <SelectItem key={col.id} value={col.id}>
            {col.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export function CollectionStatsPage() {
  const statsEnabled = useFeatureEnabled("stats");

  if (!statsEnabled) {
    return <Navigate to="/collections" />;
  }

  return <CollectionStatsContent />;
}

function CollectionStatsContent() {
  const { toggleSidebar } = useSidebar();
  const topBarSlot = use(TopBarSlotContext);
  const [collectionScope, setCollectionScope] = useState("all");
  const collectionId = collectionScope === "all" ? undefined : collectionScope;
  const stats = useCollectionStats(collectionId);

  const [groupBy, setGroupBy] = useState<CompletionGroupBy>("set");
  const [countMode, setCountMode] = useState<CompletionCountMode>("cards");
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const { hasActiveFilters } = useFilterValues();
  const scope = useScopeFromFilters();
  const prices = usePrices();

  const slugToName = new Map(stats.sets.map((set) => [set.slug, set.name]));
  const setDisplayLabel = (slug: string) => slugToName.get(slug) ?? slug;

  const availableLanguages = [...new Set(stats.allPrintings.map((printing) => printing.language))];

  const availableFilters = getAvailableFilters(stats.allPrintings, { sets: stats.sets });

  const topBarPortal =
    topBarSlot &&
    createPortal(
      <PageTopBar>
        <PageTopBarTitle onToggleSidebar={toggleSidebar}>Statistics</PageTopBarTitle>
      </PageTopBar>,
      topBarSlot,
    );

  return (
    <div className={cn("mx-auto w-full max-w-4xl pt-3")}>
      {topBarPortal}

      {/* ── Controls bar ─────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <CollectionSelector value={collectionScope} onChange={setCollectionScope} />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <ButtonGroup aria-label="Group by">
            {GROUP_BY_OPTIONS.map((option) => (
              <Button
                key={option.value}
                variant={groupBy === option.value ? "default" : "outline"}
                onClick={() => setGroupBy(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </ButtonGroup>
          <TooltipProvider>
            <ButtonGroup aria-label="Count mode">
              {COUNT_MODE_OPTIONS.map((option) => (
                <Tooltip key={option.value}>
                  <TooltipTrigger
                    render={
                      <Button
                        variant={countMode === option.value ? "default" : "outline"}
                        onClick={() => setCountMode(option.value)}
                      />
                    }
                  >
                    {option.label}
                  </TooltipTrigger>
                  <TooltipContent>{option.tooltip}</TooltipContent>
                </Tooltip>
              ))}
            </ButtonGroup>
          </TooltipProvider>
          <Button
            variant="outline"
            size="icon"
            className="relative"
            onClick={() => setFiltersExpanded(!filtersExpanded)}
            aria-label={filtersExpanded ? "Hide filters" : "Show filters"}
            aria-expanded={filtersExpanded}
          >
            <SlidersHorizontalIcon className="size-4" />
            {hasActiveFilters && !filtersExpanded && (
              <span className="bg-primary absolute -top-1 -right-1 size-2 rounded-full" />
            )}
          </Button>
        </div>
      </div>
      <Collapsible open={filtersExpanded} onOpenChange={setFiltersExpanded} className="mb-3">
        <CollapsibleContent className="h-(--collapsible-panel-height) space-y-3 overflow-hidden transition-[height] duration-200 data-[ending-style]:h-0 data-[starting-style]:h-0">
          <div className="grid grid-cols-1 gap-x-6 gap-y-3 lg:grid-cols-2">
            <FilterBadgeSections
              availableFilters={availableFilters}
              availableLanguages={availableLanguages}
              setDisplayLabel={setDisplayLabel}
              hiddenSections={HIDDEN_FILTER_SECTIONS}
            />
          </div>
        </CollapsibleContent>
      </Collapsible>
      {hasActiveFilters && (
        <div className="mb-3">
          <ActiveFilters
            availableFilters={availableFilters}
            setDisplayLabel={setDisplayLabel}
            hiddenSections={HIDDEN_FILTER_SECTIONS}
          />
        </div>
      )}

      {stats.totalCopies === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-6">
          {/* ── Completion ──────────────────────────────────── */}
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

          {/* ── Cost to Complete ────────────────────────────── */}
          <section className="space-y-4">
            <h2 className="text-base font-semibold">Cost to Complete</h2>
            <CostToCompleteChart
              allPrintings={stats.allPrintings}
              stacks={stats.stacks}
              scope={scope}
              countMode={countMode}
              prices={prices}
              marketplace={stats.marketplace}
            />
          </section>

          <Separator />

          {/* ── Stats ───────────────────────────────────────── */}
          <section className="space-y-4">
            <h2 className="text-base font-semibold">Stats</h2>
            <StatsHeroStats stats={stats} />
            <PriceExtremes
              cheapest={stats.cheapestPrinting}
              mostExpensive={stats.mostExpensivePrinting}
              formatPrice={stats.formatPrice}
            />
            <Card>
              <CardHeader>
                <CardTitle>Domain Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <DomainDistribution
                  data={stats.domainDistribution}
                  totalCopies={stats.totalCopies}
                />
              </CardContent>
            </Card>

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

            {stats.typeBreakdown.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Type Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <TypeBreakdown
                    data={stats.typeBreakdown}
                    domains={stats.typeBreakdownDomains}
                    singleColor
                  />
                </CardContent>
              </Card>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

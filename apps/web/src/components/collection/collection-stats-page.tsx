import { Progress as ProgressPrimitive } from "@base-ui/react/progress";
import type { CompletionScopePreference, Domain } from "@openrift/shared";
import { WellKnown, getAvailableFilters } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import {
  ArrowUpIcon,
  ChartBarIcon,
  CoinsIcon,
  CopyIcon,
  ExternalLinkIcon,
  SearchIcon,
  SquareIcon,
  SquareStackIcon,
} from "lucide-react";
import { use, useDeferredValue, useState } from "react";
import { createPortal } from "react-dom";
import type { PieSectorDataItem } from "recharts";
import { Label, Pie, PieChart, Sector } from "recharts";

import { CardIcon } from "@/components/card-icon";
import { CardArtThumb } from "@/components/cards/card-art-thumb";
import { CollectionValueChart } from "@/components/collection/collection-value-chart";
import { CostToCompleteChart } from "@/components/collection/cost-to-complete-chart";
import { EnergyPowerChart } from "@/components/deck/stats/energy-power-chart";
import { EmptyState } from "@/components/empty-state";
import { CompactFilterBar } from "@/components/filters/compact-filter-bar";
import { PageTopBar, PageTopBarTitle } from "@/components/layout/page-top-bar";
import { TopBarSlotContext } from "@/components/layout/top-bar-slot";
import { MarketplaceLink } from "@/components/marketplace-link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CardLink } from "@/components/ui/card-link";
import type { ChartConfig } from "@/components/ui/chart";
import { ChartContainer } from "@/components/ui/chart";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { ProgressIndicator, ProgressTrack } from "@/components/ui/progress";
import { SectionHeading } from "@/components/ui/section-heading";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useSidebar } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useFilterValues } from "@/hooks/use-card-filters";
import type {
  CollectionStats,
  CollectionStatsResult,
  CompletionEntry,
  PricedCard,
} from "@/hooks/use-collection-stats";
import { computeCompletion, filterByScope, useCollectionStats } from "@/hooks/use-collection-stats";
import { useCollections } from "@/hooks/use-collections";
import { useDomainColors } from "@/hooks/use-domain-colors";
import { useEnumOrders } from "@/hooks/use-enums";
import { useFeatureEnabled } from "@/hooks/use-feature-flags";
import { usePrices } from "@/hooks/use-prices";
import { getDomainColor } from "@/lib/domain";
import { resolveTopLevelUnits } from "@/lib/filter-sections";
import { getFilterIconPath } from "@/lib/icons";
import { MARKETPLACE_META } from "@/lib/marketplace-meta";
import type { FilterSearch } from "@/lib/search-schemas";
import type {
  CompletionCountMode,
  CompletionGroupBy,
  DomainCount,
  RarityCount,
} from "@/lib/stat-types";
import { buildMissingSearch } from "@/lib/stats-missing-search";
import { cn, PAGE_WIDTH } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";

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
          <p className="font-heading text-2xl font-semibold tabular-nums">
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
          <p className="font-heading text-2xl font-semibold tabular-nums">
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
          <p className="font-heading text-2xl font-semibold tabular-nums">
            {stats.totalCopies.toLocaleString()}
          </p>
        </CardContent>
      </Card>
      <CardLink
        render={
          <MarketplaceLink
            marketplace={stats.marketplace}
            href={MARKETPLACE_META[stats.marketplace].searchUrl("riftbound")}
          />
        }
      >
        <CardHeader>
          <CardTitle className="text-muted-foreground flex items-center gap-1.5">
            <CoinsIcon className="size-4" />
            Estimated Value
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="font-heading text-2xl font-semibold tabular-nums">
            {stats.formatPrice(stats.estimatedValue)}
          </p>
          <div className="text-muted-foreground text-xs">
            <p className="flex items-center gap-1">
              <img
                src={MARKETPLACE_META[stats.marketplace].icon}
                alt=""
                className="h-3 invert dark:invert-0"
              />
              {MARKETPLACE_META[stats.marketplace].label}
            </p>
            {stats.unpricedCount > 0 && (
              <p>
                {stats.unpricedCount} {stats.unpricedCount === 1 ? "copy" : "copies"} unpriced
              </p>
            )}
          </div>
        </CardContent>
      </CardLink>
    </div>
  );
}

// Every section left visible must stay mapped in useScopeFromFilters below,
// or a chip the scope ignores looks live and does nothing.
const HIDDEN_FILTER_SECTIONS = new Set([
  "owned",
  "superTypes",
  "markers",
  "channels",
  "energy",
  "might",
  "power",
  "price",
]);

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
  if (filters.keywords.length > 0) {
    scope.keywords = filters.keywords;
  }
  if (filters.tags.length > 0) {
    scope.tags = filters.tags;
  }
  if (filters.customTagSlugs.length > 0) {
    scope.customTags = filters.customTagSlugs;
  }
  if (filters.cardSizes.length > 0) {
    scope.cardSizes = filters.cardSizes;
  }
  if (filters.isStandard !== null) {
    scope.standard = filters.isStandard;
  }
  if (filters.presence.keywords) {
    scope.keywordsPresence = filters.presence.keywords;
  }
  if (filters.presence.tags) {
    scope.tagsPresence = filters.presence.tags;
  }
  if (filters.presence.customTags) {
    scope.customTagsPresence = filters.presence.customTags;
  }
  // Without these an exclude-mode chip changes the URL but leaves every
  // figure on the page untouched.
  if (filters.setsExclude.length > 0) {
    scope.setsExclude = filters.setsExclude;
  }
  if (filters.languagesExclude.length > 0) {
    scope.languagesExclude = filters.languagesExclude;
  }
  if (filters.domainsExclude.length > 0) {
    scope.domainsExclude = filters.domainsExclude;
  }
  if (filters.typesExclude.length > 0) {
    scope.typesExclude = filters.typesExclude;
  }
  if (filters.raritiesExclude.length > 0) {
    scope.raritiesExclude = filters.raritiesExclude;
  }
  if (filters.finishesExclude.length > 0) {
    scope.finishesExclude = filters.finishesExclude;
  }
  if (filters.artVariantsExclude.length > 0) {
    scope.artVariantsExclude = filters.artVariantsExclude;
  }
  if (filters.keywordsExclude.length > 0) {
    scope.keywordsExclude = filters.keywordsExclude;
  }
  if (filters.tagsExclude.length > 0) {
    scope.tagsExclude = filters.tagsExclude;
  }
  if (filters.customTagSlugsExclude.length > 0) {
    scope.customTagsExclude = filters.customTagSlugsExclude;
  }
  if (filters.presence.markers === "any") {
    scope.promos = "only";
  } else if (filters.presence.markers === "none") {
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
    label: "Playset",
    tooltip: "Playset quantities (3x, 1x for Legends/Battlefields). Runes and Other are left out.",
  },
];

function CompletionTotalRow({ entries }: { entries: CompletionEntry[] }) {
  const totalOwned = entries.reduce((sum, entry) => sum + entry.owned, 0);
  const totalAll = entries.reduce((sum, entry) => sum + entry.total, 0);
  const percent = totalAll > 0 ? (totalOwned / totalAll) * 100 : 0;

  return (
    <div className="bg-muted/50 -mx-2 flex items-center gap-3 rounded-md px-2 py-1.5">
      <span className="flex w-36 shrink-0 items-center text-sm font-semibold sm:w-48">Overall</span>
      <ProgressPrimitive.Root value={Math.min(percent, 100)} className="flex-1">
        <ProgressTrack className="h-1.5">
          <ProgressIndicator className="rounded-full" />
        </ProgressTrack>
      </ProgressPrimitive.Root>
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
  missingSearch,
}: {
  entry: CompletionEntry;
  icon?: string;
  barColor?: string;
  missingSearch?: Partial<FilterSearch>;
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
      {missingSearch ? (
        <Link
          to="/cards"
          search={missingSearch}
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
        </Link>
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
  const { rarityColors, labels } = useEnumOrders();

  const scopedPrintings = filterByScope(stats.allPrintings, scope, stats.customTagAssignments);

  const entries = computeCompletion({
    stacks: stats.stacks,
    scopedPrintings,
    scope,
    customTagAssignments: stats.customTagAssignments,
    sets: stats.sets,
    groupBy,
    countMode,
    orders: stats.orders,
    labels: {
      domains: labels.domains,
      rarities: labels.rarities,
      cardTypes: labels.cardTypes,
    },
  });

  const mainEntries =
    groupBy === "set"
      ? entries.filter((entry) => entry.setType === WellKnown.setType.MAIN)
      : entries;
  const supplementalEntries =
    groupBy === "set"
      ? entries.filter((entry) => entry.setType === WellKnown.setType.SUPPLEMENTAL)
      : [];

  function rowBarColor(key: string): string | undefined {
    if (groupBy === "domain") {
      return getDomainColor(key as Domain, domainColors);
    }
    if (groupBy === "rarity") {
      return rarityColors[key];
    }
    return undefined;
  }

  const setIdToSlug = new Map(stats.sets.map((set) => [set.id, set.slug]));
  const missingSearch = (key: string): Partial<FilterSearch> | undefined =>
    buildMissingSearch({ countMode, groupBy, key, scope, setIdToSlug });

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
                missingSearch={missingSearch(entry.key)}
              />
            ))}
          </div>
          {supplementalEntries.length > 0 && (
            <div className="mt-3">
              <SectionHeading as="h3" className="mb-1">
                Supplemental
              </SectionHeading>
              {supplementalEntries.map((entry) => (
                <CompletionRow
                  key={entry.key}
                  entry={entry}
                  icon={getRowIcon(groupBy, entry.key)}
                  barColor={rowBarColor(entry.key)}
                  missingSearch={missingSearch(entry.key)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

interface DonutEntry {
  name: string;
  value: number;
  fill: string;
}

function DonutActiveShape(props: PieSectorDataItem & { isActive?: boolean }) {
  return <Sector {...props} outerRadius={(props.outerRadius ?? 0) + (props.isActive ? 4 : 0)} />;
}

interface DonutCenterLabelProps {
  viewBox?: { cx?: number; cy?: number } | unknown;
  active?: DonutEntry;
}

function DonutCenterLabel({ viewBox, active }: DonutCenterLabelProps) {
  if (!viewBox || typeof viewBox !== "object" || !("cx" in viewBox) || !("cy" in viewBox)) {
    return null;
  }
  const cx = viewBox.cx as number | undefined;
  const cy = viewBox.cy as number | undefined;
  return (
    <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle">
      {active ? (
        <>
          <tspan x={cx} y={(cy ?? 0) - 6} className="fill-foreground text-sm font-bold">
            {active.value.toLocaleString()}
          </tspan>
          <tspan x={cx} y={(cy ?? 0) + 10} className="fill-muted-foreground text-2xs">
            {active.name}
          </tspan>
        </>
      ) : null}
    </text>
  );
}

function DistributionDonut({ data, config }: { data: DonutEntry[]; config: ChartConfig }) {
  const [activeIndex, setActiveIndex] = useState<number>();
  const active = activeIndex === undefined ? undefined : data[activeIndex];

  return (
    <div>
      <ChartContainer config={config} className="mx-auto aspect-square max-h-36">
        <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="55%"
            outerRadius="90%"
            strokeWidth={2}
            isAnimationActive={false}
            shape={DonutActiveShape}
            onMouseEnter={(_, index) => setActiveIndex(index)}
            onMouseLeave={() => setActiveIndex(undefined)}
          >
            <Label content={<DonutCenterLabel active={active} />} />
          </Pie>
        </PieChart>
      </ChartContainer>
      <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1">
        {data.map((entry) => (
          <div key={entry.name} className="flex items-center gap-1.5 text-xs">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: entry.fill }}
            />
            <span className="text-muted-foreground">{entry.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DomainDistributionChart({ data }: { data: DomainCount[] }) {
  const domainColors = useDomainColors();
  const { labels } = useEnumOrders();

  if (data.length === 0) {
    return null;
  }

  const config: ChartConfig = {};
  const chartData: DonutEntry[] = data.map((entry) => {
    const label = labels.domains[entry.domain];
    const color = getDomainColor(entry.domain, domainColors);
    config[entry.domain] = { label, color };
    return { name: label, value: entry.count, fill: color };
  });

  return <DistributionDonut data={chartData} config={config} />;
}

function RarityDistributionChart({ data }: { data: RarityCount[] }) {
  const { rarityColors, labels } = useEnumOrders();

  if (data.length === 0) {
    return null;
  }

  const config: ChartConfig = {};
  const chartData: DonutEntry[] = data.map((entry) => {
    const label = labels.rarities[entry.rarity];
    const color = rarityColors[entry.rarity] ?? "var(--color-muted-foreground)";
    config[entry.rarity] = { label, color };
    return { name: label, value: entry.count, fill: color };
  });

  return <DistributionDonut data={chartData} config={config} />;
}

const TYPE_CHART_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

function TypeDistributionChart({ data }: { data: { type: string; total: number }[] }) {
  const { labels } = useEnumOrders();

  if (data.length === 0) {
    return null;
  }

  const config: ChartConfig = {};
  const chartData: DonutEntry[] = data.map((entry, index) => {
    const label = labels.cardTypes[entry.type];
    const color = TYPE_CHART_COLORS[index % TYPE_CHART_COLORS.length];
    config[entry.type] = { label, color };
    return { name: label, value: entry.total, fill: color };
  });

  return <DistributionDonut data={chartData} config={config} />;
}

const COLLAPSED_EXPENSIVE_PRINTINGS = 2;

function MostExpensivePrintings({
  printings,
  formatPrice,
}: {
  printings: PricedCard[];
  formatPrice: (value?: number | null) => string;
}) {
  const [expanded, setExpanded] = useState(false);

  if (printings.length === 0) {
    return null;
  }

  const visible = expanded ? printings : printings.slice(0, COLLAPSED_EXPENSIVE_PRINTINGS);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <ArrowUpIcon className="size-4" />
          Most Expensive Printings
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {visible.map((printing, index) => (
            <Link
              key={printing.printingId}
              to="/cards/$cardSlug"
              params={{ cardSlug: printing.cardSlug }}
              className="hover:bg-muted/50 focus-visible:ring-ring/50 flex items-center gap-3 rounded-md p-2 no-underline transition-colors outline-none focus-visible:ring-2"
            >
              <span className="text-muted-foreground w-5 shrink-0 text-right tabular-nums">
                {index + 1}
              </span>
              {printing.thumbnail && (
                <HoverCard>
                  {/* Base UI's default trigger is an anchor, which can't nest
                      inside the row's own link. */}
                  <HoverCardTrigger render={<span />}>
                    <CardArtThumb src={printing.thumbnail} className="h-32" />
                  </HoverCardTrigger>
                  {printing.fullImage && (
                    <HoverCardContent side="right" className="w-auto p-1">
                      <img src={printing.fullImage} alt="" className="h-80 w-auto rounded-md" />
                    </HoverCardContent>
                  )}
                </HoverCard>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{printing.name}</p>
                <p className="text-muted-foreground text-xs tabular-nums">
                  {formatPrice(printing.price)}
                </p>
              </div>
            </Link>
          ))}
        </div>
        {printings.length > COLLAPSED_EXPENSIVE_PRINTINGS && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setExpanded(!expanded);
            }}
          >
            {expanded ? "Show less" : `Show more (${printings.length})`}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function StatsSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-48 w-full" />
      <Skeleton className="h-64 w-full" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    </div>
  );
}

function StatsEmptyState() {
  return (
    <EmptyState
      className="py-20"
      icon={ChartBarIcon}
      title="No cards in collection yet"
      description="Browse the catalog and add cards to see statistics about your collection."
    >
      <Button variant="default" render={<Link to="/cards" />}>
        <SearchIcon />
        Browse cards
      </Button>
    </EmptyState>
  );
}

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

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <CollectionSelector value={collectionScope} onChange={setCollectionScope} />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <ToggleGroup
            variant="outline"
            spacing={0}
            value={[groupBy]}
            onValueChange={([next]) => {
              const option = GROUP_BY_OPTIONS.find((entry) => entry.value === next);
              if (option) {
                setGroupBy(option.value);
              }
            }}
            aria-label="Group by"
          >
            {GROUP_BY_OPTIONS.map((option) => (
              <ToggleGroupItem key={option.value} value={option.value}>
                {option.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <TooltipProvider>
            <ToggleGroup
              variant="outline"
              spacing={0}
              value={[countMode]}
              onValueChange={([next]) => {
                const option = COUNT_MODE_OPTIONS.find((entry) => entry.value === next);
                if (option) {
                  setCountMode(option.value);
                }
              }}
              aria-label="Count mode"
            >
              {COUNT_MODE_OPTIONS.map((option) => (
                <Tooltip key={option.value}>
                  <TooltipTrigger render={<ToggleGroupItem value={option.value} />}>
                    {option.label}
                  </TooltipTrigger>
                  <TooltipContent>{option.tooltip}</TooltipContent>
                </Tooltip>
              ))}
            </ToggleGroup>
          </TooltipProvider>
        </div>
      </div>
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

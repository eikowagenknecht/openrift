import type { CompletionScopePreference, Domain } from "@openrift/shared";
import { Link, Navigate } from "@tanstack/react-router";
import {
  ChartBarIcon,
  CircleCheckBigIcon,
  CoinsIcon,
  ExternalLinkIcon,
  FilterIcon,
  LayersIcon,
  PackageIcon,
  SearchIcon,
} from "lucide-react";
import { use, useState } from "react";
import { createPortal } from "react-dom";

import { CardIcon } from "@/components/card-icon";
import { EnergyPowerChart } from "@/components/deck/stats/energy-power-chart";
import { TypeBreakdown } from "@/components/deck/stats/type-breakdown";
import { PageTopBar, PageTopBarTitle } from "@/components/layout/page-top-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSidebar } from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type {
  CollectionStats,
  CollectionStatsResult,
  CompletionCountMode,
  CompletionEntry,
  CompletionGroupBy,
} from "@/hooks/use-collection-stats";
import { computeCompletion, filterByScope, useCollectionStats } from "@/hooks/use-collection-stats";
import { useCollections } from "@/hooks/use-collections";
import { useDomainColors } from "@/hooks/use-domain-colors";
import { useEnumOrders, useLanguageList } from "@/hooks/use-enums";
import { useFeatureEnabled } from "@/hooks/use-feature-flags";
import { getDomainColor } from "@/lib/domain";
import { getFilterIconPath } from "@/lib/icons";
import type { DomainCount } from "@/lib/stat-types";
import { cn } from "@/lib/utils";
import { TopBarSlotContext } from "@/routes/_app/_authenticated/collections/route";
import { useDisplayStore } from "@/stores/display-store";

// ── Hero Stats ─────────────────────────────────────────────────────────────

function HeroStats({ stats }: { stats: CollectionStats }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Card size="sm">
        <CardHeader>
          <CardTitle className="text-muted-foreground flex items-center gap-1.5 text-xs font-normal">
            <PackageIcon className="size-4" />
            Total Copies
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold tabular-nums">
            {stats.totalCopies.toLocaleString()}
          </p>
        </CardContent>
      </Card>
      <Card size="sm">
        <CardHeader>
          <CardTitle className="text-muted-foreground flex items-center gap-1.5 text-xs font-normal">
            <LayersIcon className="size-4" />
            Unique Cards
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold tabular-nums">
            {stats.uniqueCards.toLocaleString()}
            <span className="text-muted-foreground ml-1 text-sm font-normal">
              / {stats.totalCardsInGame.toLocaleString()}
            </span>
          </p>
        </CardContent>
      </Card>
      <Card size="sm">
        <CardHeader>
          <CardTitle className="text-muted-foreground flex items-center gap-1.5 text-xs font-normal">
            <CoinsIcon className="size-4" />
            Estimated Value
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold tabular-nums">
            {stats.formatPrice(stats.estimatedValue)}
          </p>
          {stats.unpricedCount > 0 && (
            <p className="text-muted-foreground text-xs">
              {stats.unpricedCount} {stats.unpricedCount === 1 ? "copy" : "copies"} unpriced
            </p>
          )}
        </CardContent>
      </Card>
      <Card size="sm">
        <CardHeader>
          <CardTitle className="text-muted-foreground flex items-center gap-1.5 text-xs font-normal">
            <CircleCheckBigIcon className="size-4" />
            Completion
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold tabular-nums">
            {stats.completionPercent.toFixed(1)}%
          </p>
          <Progress value={stats.completionPercent} className="mt-2" />
        </CardContent>
      </Card>
    </div>
  );
}

// ── Scope Filter Popover ───────────────────────────────────────────────────

function ScopeFilterBadge({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Badge variant={active ? "default" : "outline"} className="cursor-pointer" onClick={onClick}>
      {label}
    </Badge>
  );
}

function ScopeFilterPopover({
  scope,
  onScopeChange,
}: {
  scope: CompletionScopePreference;
  onScopeChange: (scope: CompletionScopePreference) => void;
}) {
  const { orders, labels } = useEnumOrders();
  const languageList = useLanguageList();

  const hasActiveFilters =
    (scope.languages && scope.languages.length > 0) ||
    (scope.finishes && scope.finishes.length > 0) ||
    (scope.artVariants && scope.artVariants.length > 0) ||
    scope.promos !== undefined;

  function toggleIn(current: string[] | undefined, value: string): string[] | undefined {
    if (!current || current.length === 0) {
      // First click: selecting one value means "only this one"
      return [value];
    }
    if (current.includes(value)) {
      const next = current.filter((item) => item !== value);
      // If empty, clear the filter (include all)
      return next.length > 0 ? next : undefined;
    }
    return [...current, value];
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm" className="gap-1.5 text-xs">
            <FilterIcon className="size-3.5" />
            Scope
            {hasActiveFilters && (
              <span className="bg-primary text-primary-foreground flex size-4 items-center justify-center rounded-full text-[10px]">
                {(scope.languages?.length ?? 0) +
                  (scope.finishes?.length ?? 0) +
                  (scope.artVariants?.length ?? 0) +
                  (scope.promos ? 1 : 0)}
              </span>
            )}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-80 space-y-3">
        <div>
          <p className="text-muted-foreground mb-1.5 text-xs font-medium">Language</p>
          <div className="flex flex-wrap gap-1">
            {languageList.map((lang) => (
              <ScopeFilterBadge
                key={lang.code}
                label={lang.name}
                active={scope.languages?.includes(lang.code) ?? false}
                onClick={() =>
                  onScopeChange({ ...scope, languages: toggleIn(scope.languages, lang.code) })
                }
              />
            ))}
          </div>
        </div>
        <div>
          <p className="text-muted-foreground mb-1.5 text-xs font-medium">Finish</p>
          <div className="flex flex-wrap gap-1">
            {orders.finishes.map((finish) => (
              <ScopeFilterBadge
                key={finish}
                label={labels.finishes[finish] ?? finish}
                active={scope.finishes?.includes(finish) ?? false}
                onClick={() =>
                  onScopeChange({ ...scope, finishes: toggleIn(scope.finishes, finish) })
                }
              />
            ))}
          </div>
        </div>
        <div>
          <p className="text-muted-foreground mb-1.5 text-xs font-medium">Art Variant</p>
          <div className="flex flex-wrap gap-1">
            {orders.artVariants.map((variant) => (
              <ScopeFilterBadge
                key={variant}
                label={labels.artVariants[variant] ?? variant}
                active={scope.artVariants?.includes(variant) ?? false}
                onClick={() =>
                  onScopeChange({ ...scope, artVariants: toggleIn(scope.artVariants, variant) })
                }
              />
            ))}
          </div>
        </div>
        <div>
          <p className="text-muted-foreground mb-1.5 text-xs font-medium">Promos</p>
          <div className="flex flex-wrap gap-1">
            <Badge
              variant={scope.promos === undefined ? "outline" : "default"}
              className="cursor-pointer"
              onClick={() => {
                const next =
                  scope.promos === undefined
                    ? "only"
                    : scope.promos === "only"
                      ? "exclude"
                      : undefined;
                onScopeChange({ ...scope, promos: next });
              }}
            >
              {scope.promos === "only"
                ? "Only promos"
                : scope.promos === "exclude"
                  ? "No promos"
                  : "Promo"}
            </Badge>
          </div>
        </div>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs"
            onClick={() => onScopeChange({})}
          >
            Clear all
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
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

function CompletionSection({ stats }: { stats: CollectionStatsResult }) {
  const [groupBy, setGroupBy] = useState<CompletionGroupBy>("set");
  const [countMode, setCountMode] = useState<CompletionCountMode>("cards");
  const scope = useDisplayStore((state) => state.completionScope);
  const setCompletionScope = useDisplayStore((state) => state.setCompletionScope);
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
    groupBy === "set"
      ? entries.filter((entry) => entry.setType === "supplemental" && entry.owned > 0)
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
    if (scope.languages && scope.languages.length > 0) {
      params.set("languages", scope.languages.join(","));
    }
    if (scope.finishes && scope.finishes.length > 0) {
      params.set("finishes", scope.finishes.join(","));
    }
    if (scope.artVariants && scope.artVariants.length > 0) {
      params.set("artVariants", scope.artVariants.join(","));
    }
    return `/cards?${params.toString()}`;
  }

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-medium">Completion</h3>
        <div className="ml-auto flex flex-wrap gap-2">
          <ButtonGroup aria-label="Group by">
            {GROUP_BY_OPTIONS.map((option) => (
              <Button
                key={option.value}
                variant={groupBy === option.value ? "default" : "outline"}
                size="sm"
                className="text-xs"
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
                        size="sm"
                        className="text-xs"
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
          <ScopeFilterPopover scope={scope} onScopeChange={setCompletionScope} />
        </div>
      </div>

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
    <section>
      <h3 className="mb-2 text-sm font-medium">Domain Distribution</h3>
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
    </section>
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
        <Button variant="default" size="sm" render={<Link to="/cards" />}>
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
  const [scope, setScope] = useState("all");
  const collectionId = scope === "all" ? undefined : scope;
  const stats = useCollectionStats(collectionId);

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

      <div className="mb-4">
        <CollectionSelector value={scope} onChange={setScope} />
      </div>

      {stats.totalCopies === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-6">
          <HeroStats stats={stats} />
          <CompletionSection stats={stats} />
          <DomainDistribution data={stats.domainDistribution} totalCopies={stats.totalCopies} />

          {(stats.energyCurve.length > 0 || stats.powerCurve.length > 0) && (
            <section>
              <h3 className="mb-2 text-sm font-medium">Energy &amp; Power</h3>
              <EnergyPowerChart
                energyData={stats.energyCurve}
                energyStacks={stats.energyCurveStacks}
                averageEnergy={stats.averageEnergy}
                powerData={stats.powerCurve}
                powerStacks={stats.powerCurveStacks}
                averagePower={stats.averagePower}
              />
            </section>
          )}

          {stats.typeBreakdown.length > 0 && (
            <section>
              <TypeBreakdown data={stats.typeBreakdown} domains={stats.typeBreakdownDomains} />
            </section>
          )}
        </div>
      )}
    </div>
  );
}

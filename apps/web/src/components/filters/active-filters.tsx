import type { AvailableFilters, PresenceDimension, RangeKey } from "@openrift/shared";
import { MinusIcon, XIcon } from "lucide-react";

import { CardIcon } from "@/components/card-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useFilterActions, useFilterValues } from "@/hooks/use-card-filters";
import { useCustomTagList, useEnumOrders } from "@/hooks/use-enums";
import { buildChannelBreadcrumbsBySlug } from "@/lib/channel-breadcrumbs";
import { formatDomainFilterLabel } from "@/lib/domain";
import { compactFormatterForMarketplace } from "@/lib/format";
import { getFilterIconPath } from "@/lib/icons";
import { PRESENCE_LABELS } from "@/lib/presence-filter";
import { rangeBadgeLabel } from "@/lib/range-label";
import { cn } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";

interface RangeBadgeSection {
  key: RangeKey;
  label: string;
  formatValue?: (v: number) => string;
}

const STAT_RANGE_BADGE_SECTIONS: RangeBadgeSection[] = [
  { key: "energy", label: "Energy" },
  { key: "might", label: "Might" },
  { key: "power", label: "Power" },
];

interface ActiveFiltersProps {
  availableFilters: AvailableFilters;
  setDisplayLabel?: (code: string) => string;
  hiddenSections?: ReadonlySet<string>;
  /** Upper bound for the Copies chip — see CardBrowserFilterMeta.ownedCountMax. */
  ownedCountMax?: number;
}

export function ActiveFilters({
  availableFilters,
  setDisplayLabel,
  hiddenSections,
  ownedCountMax,
}: ActiveFiltersProps) {
  const { labels } = useEnumOrders();
  const { all: allCustomTags } = useCustomTagList();
  const { filterState, ranges } = useFilterValues();
  const {
    toggleArrayFilter,
    setRange,
    setOwnedCountRange,
    clearSigned,
    clearPresence,
    clearBanned,
    clearErrata,
    clearStandard,
    clearAllFilters,
    setSearch,
  } = useFilterActions();
  // Presence chips, one per dimension, each cleared independently. Coalesce to
  // null so an unset param (undefined) never reads as an active constraint.
  const presenceChips: [PresenceDimension, "any" | "none" | null][] = [
    ["markers", filterState.markersPresence ?? null],
    ["superTypes", filterState.superTypesPresence ?? null],
    ["customTags", filterState.customTagsPresence ?? null],
    ["distributionChannels", filterState.channelsPresence ?? null],
    ["keywords", filterState.keywordsPresence ?? null],
  ];
  const ownedBucketLabels: Record<string, string> = {
    none: "None",
    partial: "Partial Playset",
    full: "Full Playset",
    extra: "More than Full",
  };
  const favoriteMarketplace = useDisplayStore((s) => s.marketplaceOrder[0] ?? "cardtrader");

  const rangeBadgeSections: RangeBadgeSection[] = [
    ...STAT_RANGE_BADGE_SECTIONS,
    {
      key: "price",
      label: "Price",
      formatValue: compactFormatterForMarketplace(favoriteMarketplace),
    },
  ];
  type FilterKey =
    | "sets"
    | "rarities"
    | "types"
    | "superTypes"
    | "domains"
    | "artVariants"
    | "finishes"
    | "cardSizes"
    | "markers"
    | "channels"
    | "keywords"
    | "owned";

  const markerLabel = (slug: string) =>
    availableFilters.markers.find((m) => m.slug === slug)?.label ?? slug;
  const channelBreadcrumbs = buildChannelBreadcrumbsBySlug(availableFilters.distributionChannels);
  const channelLabel = (slug: string) => channelBreadcrumbs.get(slug) ?? slug;

  // Group selected custom tags by their category so each renders with the
  // category label (matching the per-category dropdowns in the filter panel).
  // Unknown slugs (e.g. a tag deleted after being saved into a deck URL)
  // fall into an "Other" bucket so the user can still remove them.
  const customTagBySlug = new Map(allCustomTags.map((tag) => [tag.slug, tag]));
  const customTagGroups: { categorySlug: string; categoryLabel: string; values: string[] }[] = [];
  for (const slug of filterState.customTags) {
    const tag = customTagBySlug.get(slug);
    const categorySlug = tag?.category ?? "__unknown";
    const categoryLabel = tag?.categoryLabel ?? "Tag";
    const existing = customTagGroups.find((g) => g.categorySlug === categorySlug);
    if (existing) {
      existing.values.push(slug);
    } else {
      customTagGroups.push({ categorySlug, categoryLabel, values: [slug] });
    }
  }
  // Exclude (`*Ex`) chips, mirroring the include `filterGroups` but reading the
  // negation arrays and removing via the exclude key (ADR-034). The `section`
  // drives both the hidden-section guard and the icon lookup (icons key off the
  // base dimension, not the `*Ex` slug).
  type ExcludeKey =
    | "setsEx"
    | "raritiesEx"
    | "typesEx"
    | "superTypesEx"
    | "domainsEx"
    | "artVariantsEx"
    | "finishesEx"
    | "markersEx"
    | "channelsEx"
    | "keywordsEx";
  // Section keys an exclude chip can carry. Excludes the icon-less "owned" /
  // "cardSizes" so the value passes straight to `getFilterIconPath` once the
  // markers/channels rows (which also lack icons) are guarded out.
  type ExcludeSection =
    | "sets"
    | "rarities"
    | "types"
    | "superTypes"
    | "domains"
    | "artVariants"
    | "finishes"
    | "markers"
    | "channels"
    | "keywords";
  const excludeGroupDefs: {
    key: ExcludeKey;
    section: ExcludeSection;
    label: string;
    values: string[];
    displayLabel?: (v: string) => string;
  }[] = [
    { key: "setsEx", section: "sets", label: "Set", values: filterState.setsEx },
    {
      key: "raritiesEx",
      section: "rarities",
      label: "Rarity",
      values: filterState.raritiesEx,
      displayLabel: (v: string) => labels.rarities[v] ?? v,
    },
    {
      key: "typesEx",
      section: "types",
      label: "Type",
      values: filterState.typesEx,
      displayLabel: (v: string) => labels.cardTypes[v] ?? v,
    },
    {
      key: "superTypesEx",
      section: "superTypes",
      label: "Supertype",
      values: filterState.superTypesEx,
      displayLabel: (v: string) => labels.superTypes[v] ?? v,
    },
    {
      key: "domainsEx",
      section: "domains",
      label: "Domain",
      values: filterState.domainsEx,
      displayLabel: (v: string) => formatDomainFilterLabel(v, labels.domains),
    },
    {
      key: "artVariantsEx",
      section: "artVariants",
      label: "Art Variant",
      values: filterState.artVariantsEx,
      displayLabel: (v: string) => labels.artVariants[v] ?? v,
    },
    {
      key: "finishesEx",
      section: "finishes",
      label: "Finish",
      values: filterState.finishesEx,
      displayLabel: (v: string) => labels.finishes[v] ?? v,
    },
    {
      key: "markersEx",
      section: "markers",
      label: "Marker",
      values: filterState.markersEx,
      displayLabel: markerLabel,
    },
    {
      key: "channelsEx",
      section: "channels",
      label: "Distribution Channel",
      values: filterState.channelsEx,
      displayLabel: channelLabel,
    },
    {
      key: "keywordsEx",
      section: "keywords",
      label: "Keyword",
      values: filterState.keywordsEx,
    },
  ];
  const excludeGroups = excludeGroupDefs.filter(
    (group) => group.values.length > 0 && !hiddenSections?.has(group.section),
  );

  // Excluded custom tags, grouped by category exactly like the include side.
  const customTagExcludeGroups: { categoryLabel: string; values: string[] }[] = [];
  for (const slug of filterState.customTagsEx) {
    const tag = customTagBySlug.get(slug);
    const categoryLabel = tag?.categoryLabel ?? "Tag";
    const existing = customTagExcludeGroups.find((group) => group.categoryLabel === categoryLabel);
    if (existing) {
      existing.values.push(slug);
    } else {
      customTagExcludeGroups.push({ categoryLabel, values: [slug] });
    }
  }

  const customTagsHidden = hiddenSections?.has("customTags") ?? false;
  const copiesRangeActive =
    !hiddenSections?.has("owned") &&
    (filterState.ownedCountMin !== null || filterState.ownedCountMax !== null);

  const filterGroups: {
    key: FilterKey;
    label: string;
    values: string[];
    displayLabel?: (v: string) => string;
  }[] = [
    { key: "sets", label: "Set", values: filterState.sets },
    {
      key: "rarities",
      label: "Rarity",
      values: filterState.rarities,
      displayLabel: (v: string) => labels.rarities[v] ?? v,
    },
    {
      key: "types",
      label: "Type",
      values: filterState.types,
      displayLabel: (v: string) => labels.cardTypes[v] ?? v,
    },
    {
      key: "superTypes",
      label: "Supertype",
      values: filterState.superTypes,
      displayLabel: (v: string) => labels.superTypes[v] ?? v,
    },
    {
      key: "domains",
      label: "Domain",
      values: filterState.domains,
      displayLabel: (v: string) => formatDomainFilterLabel(v, labels.domains),
    },
    {
      key: "artVariants",
      label: "Art Variant",
      values: filterState.artVariants,
      displayLabel: (v: string) => labels.artVariants[v] ?? v,
    },
    {
      key: "finishes",
      label: "Finish",
      values: filterState.finishes,
      displayLabel: (v: string) => labels.finishes[v] ?? v,
    },
    {
      key: "cardSizes",
      label: "Size",
      values: filterState.cardSizes,
      displayLabel: (v: string) => labels.cardSizes[v] ?? v,
    },
    {
      key: "markers",
      label: "Marker",
      values: filterState.markers,
      displayLabel: markerLabel,
    },
    {
      key: "channels",
      label: "Distribution Channel",
      values: filterState.channels,
      displayLabel: channelLabel,
    },
    {
      key: "keywords",
      label: "Keyword",
      values: filterState.keywords,
    },
    {
      key: "owned",
      label: "Owned",
      values: filterState.owned,
      displayLabel: (v: string) => ownedBucketLabels[v] ?? v,
    },
  ].filter(
    (
      g,
    ): g is {
      key: FilterKey;
      label: string;
      values: string[];
      displayLabel?: (v: string) => string;
    } => g.values.length > 0 && !hiddenSections?.has(g.key),
  );

  const hasVisibleContent =
    filterState.search !== "" ||
    filterGroups.length > 0 ||
    excludeGroups.length > 0 ||
    (!customTagsHidden && customTagGroups.length > 0) ||
    (!customTagsHidden && customTagExcludeGroups.length > 0) ||
    rangeBadgeSections.some(({ key }) => ranges[key].min !== null || ranges[key].max !== null) ||
    copiesRangeActive ||
    filterState.signed !== null ||
    presenceChips.some(([, value]) => value !== null) ||
    filterState.banned !== null ||
    filterState.errata !== null ||
    filterState.standard !== null;

  if (!hasVisibleContent) {
    return null;
  }

  return (
    <div className="mb-3 flex items-center gap-2">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
        {filterState.search && (
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground hidden text-xs sm:inline">Search:</span>
            <Badge variant="secondary" className="gap-1">
              &ldquo;{filterState.search}&rdquo;
              <button
                type="button"
                onClick={() => setSearch("")}
                className="hover:text-foreground ml-0.5"
              >
                <XIcon className="size-3" />
              </button>
            </Badge>
          </div>
        )}
        {filterGroups.map(({ key, label, values, displayLabel: groupDisplayLabel }) => (
          <div key={key} className="flex min-w-0 flex-wrap items-center gap-1">
            <span className="text-muted-foreground hidden text-xs sm:inline">{label}:</span>
            {values.map((value) => {
              // Markers, channels, and owned buckets don't have icon assets —
              // skip the lookup so we can pass `key` straight through.
              const icon =
                key === "markers" || key === "channels" || key === "owned" || key === "keywords"
                  ? undefined
                  : getFilterIconPath(key, value);
              const displayFn =
                groupDisplayLabel ??
                (key === "sets" && setDisplayLabel ? setDisplayLabel : (v: string) => v);
              return (
                <Badge key={`${key}-${value}`} variant="secondary" className="gap-1">
                  {icon && <CardIcon src={icon} />}
                  {displayFn(value)}
                  <button
                    type="button"
                    onClick={() => toggleArrayFilter(key, value)}
                    className="hover:text-foreground ml-0.5"
                  >
                    <XIcon className="size-3" />
                  </button>
                </Badge>
              );
            })}
          </div>
        ))}
        {!customTagsHidden &&
          customTagGroups.map(({ categorySlug, categoryLabel, values }) => (
            <div
              key={`customTags-${categorySlug}`}
              className="flex min-w-0 flex-wrap items-center gap-1"
            >
              <span className="text-muted-foreground hidden text-xs sm:inline">
                {categoryLabel}:
              </span>
              {values.map((slug) => {
                const tag = customTagBySlug.get(slug);
                return (
                  <Badge key={`customTags-${slug}`} variant="secondary" className="gap-1">
                    {tag?.label ?? slug}
                    <button
                      type="button"
                      onClick={() => toggleArrayFilter("customTags", slug)}
                      className="hover:text-foreground ml-0.5"
                    >
                      <XIcon className="size-3" />
                    </button>
                  </Badge>
                );
              })}
            </div>
          ))}
        {excludeGroups.map(({ key, section, label, values, displayLabel: groupDisplayLabel }) => (
          <div key={key} className="flex min-w-0 flex-wrap items-center gap-1">
            <span className="text-muted-foreground hidden text-xs sm:inline">{label}:</span>
            {values.map((value) => {
              const icon =
                section === "markers" || section === "channels" || section === "keywords"
                  ? undefined
                  : getFilterIconPath(section, value);
              const displayFn =
                groupDisplayLabel ??
                (section === "sets" && setDisplayLabel ? setDisplayLabel : (v: string) => v);
              return (
                <Badge
                  key={`${key}-${value}`}
                  variant="outline"
                  className="border-destructive/40 text-destructive gap-1"
                >
                  <MinusIcon className="size-3 shrink-0" />
                  {icon && <CardIcon src={icon} />}
                  <span className="line-through">{displayFn(value)}</span>
                  <button
                    type="button"
                    onClick={() => toggleArrayFilter(key, value)}
                    aria-label={`Remove excluded ${label} ${displayFn(value)}`}
                    className="hover:text-foreground ml-0.5"
                  >
                    <XIcon className="size-3" />
                  </button>
                </Badge>
              );
            })}
          </div>
        ))}
        {!customTagsHidden &&
          customTagExcludeGroups.map(({ categoryLabel, values }) => (
            <div
              key={`customTagsEx-${categoryLabel}`}
              className="flex min-w-0 flex-wrap items-center gap-1"
            >
              <span className="text-muted-foreground hidden text-xs sm:inline">
                {categoryLabel}:
              </span>
              {values.map((slug) => {
                const tag = customTagBySlug.get(slug);
                return (
                  <Badge
                    key={`customTagsEx-${slug}`}
                    variant="outline"
                    className="border-destructive/40 text-destructive gap-1"
                  >
                    <MinusIcon className="size-3 shrink-0" />
                    <span className="line-through">{tag?.label ?? slug}</span>
                    <button
                      type="button"
                      onClick={() => toggleArrayFilter("customTagsEx", slug)}
                      aria-label={`Remove excluded ${tag?.label ?? slug}`}
                      className="hover:text-foreground ml-0.5"
                    >
                      <XIcon className="size-3" />
                    </button>
                  </Badge>
                );
              })}
            </div>
          ))}
        {rangeBadgeSections.map(({ key, label, formatValue }) => {
          const range = ranges[key];
          if (range.min === null && range.max === null) {
            return null;
          }
          return (
            <RangeBadge
              key={key}
              label={label}
              min={range.min}
              max={range.max}
              availableMin={availableFilters[key].min}
              availableMax={availableFilters[key].max}
              onClear={() => setRange(key, null, null)}
              formatValue={formatValue}
            />
          );
        })}
        {copiesRangeActive && (
          <RangeBadge
            label="Copies"
            min={filterState.ownedCountMin}
            max={filterState.ownedCountMax}
            availableMin={0}
            availableMax={ownedCountMax ?? 0}
            onClear={() => setOwnedCountRange(null, null)}
          />
        )}
        {filterState.signed !== null && (
          <FlagChip label="Signed" state={filterState.signed} onClear={clearSigned} />
        )}
        {presenceChips.map(([dimension, value]) =>
          value === null ? null : (
            <FlagChip
              key={dimension}
              label={PRESENCE_LABELS[dimension]}
              state={value === "any"}
              onClear={() => clearPresence(dimension)}
            />
          ),
        )}
        {filterState.banned !== null && (
          <FlagChip label="Banned" state={filterState.banned} onClear={clearBanned} />
        )}
        {filterState.errata !== null && (
          <FlagChip label="Errata" state={filterState.errata} onClear={clearErrata} />
        )}
        {filterState.standard !== null && (
          <FlagChip label="Standard" state={filterState.standard} onClear={clearStandard} />
        )}
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        className="text-muted-foreground hover:text-foreground shrink-0 self-start"
        onClick={clearAllFilters}
        title="Clear all filters"
      >
        <XIcon className="size-4" />
      </Button>
    </div>
  );
}

/**
 * A tri-state boolean filter chip (Signed, Promo, Banned, Errata, Standard) in
 * the same include/exclude language as the multi-select chips (ADR-034): the
 * trait name with a secondary fill when required (`true`), or a struck-out
 * destructive "−Promo" when forbidden (`false`). The caller only renders it when
 * the flag is set, so `state` is never null here.
 * @returns The flag chip.
 */
function FlagChip({
  label,
  state,
  onClear,
}: {
  label: string;
  state: boolean;
  onClear: () => void;
}) {
  const excluded = state === false;
  return (
    <div className="flex items-center gap-1">
      <span className="text-muted-foreground hidden text-xs sm:inline">Flag:</span>
      <Badge
        variant={excluded ? "outline" : "secondary"}
        className={cn("gap-1", excluded && "border-destructive/40 text-destructive")}
      >
        {excluded && <MinusIcon className="size-3 shrink-0" />}
        <span className={cn(excluded && "line-through")}>{label}</span>
        <button
          type="button"
          onClick={onClear}
          aria-label={`Clear ${label} filter`}
          className="hover:text-foreground ml-0.5"
        >
          <XIcon className="size-3" />
        </button>
      </Badge>
    </div>
  );
}

function RangeBadge({
  label,
  min,
  max,
  availableMin,
  availableMax,
  onClear,
  formatValue,
}: {
  label: string;
  min: number | null;
  max: number | null;
  availableMin: number;
  availableMax: number;
  onClear: () => void;
  formatValue?: (value: number) => string;
}) {
  const valueLabel = rangeBadgeLabel(min, max, availableMin, availableMax, formatValue);

  return (
    <div className="flex items-center gap-1">
      <span className="text-muted-foreground hidden text-xs sm:inline">{label}:</span>
      <Badge variant="secondary" className="gap-1">
        {/* On mobile the external prefix is hidden, so carry the label inside
            the chip ("Energy 1-3") — a bare range value alone is ambiguous. */}
        <span className="sm:hidden">{label}</span>
        {valueLabel}
        <button type="button" onClick={onClear} className="hover:text-foreground ml-0.5">
          <XIcon className="size-3" />
        </button>
      </Badge>
    </div>
  );
}

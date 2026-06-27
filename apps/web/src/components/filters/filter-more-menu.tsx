import type { AvailableFilters, FilterCounts } from "@openrift/shared";
import { CheckIcon, ChevronDownIcon, MinusIcon } from "lucide-react";
import { Fragment } from "react";

import {
  FilterRangeSections,
  OWNED_BUCKETS,
  useHasMoreSectionContent,
} from "@/components/filters/filter-panel-content";
import {
  FILTER_TRIGGER_ACTIVE_CLASS,
  FILTER_TRIGGER_CLASS,
  MultiSelectCombobox,
  NEUTRAL_HOVER_SCOPE,
} from "@/components/filters/multi-select-combobox";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useFilterActions, useFilterValues } from "@/hooks/use-card-filters";
import { useCustomTagList } from "@/hooks/use-enums";
import { buildChannelBreadcrumbs } from "@/lib/channel-breadcrumbs";
import { cn } from "@/lib/utils";

interface FilterMoreMenuProps {
  availableFilters: AvailableFilters;
  hiddenSections?: ReadonlySet<string>;
  /** See {@link FilterPanelContentProps.visibleCustomTagCategories}. */
  visibleCustomTagCategories?: ReadonlySet<string>;
  filterCounts?: FilterCounts;
  /** Upper bound for the Copies range slider; see {@link FilterPanelContentProps.ownedCountMax}. */
  ownedCountMax?: number;
  /** Active selections across every More dimension; shown as "(n)" on the trigger. */
  activeCount: number;
  /** Suppress the Signed flag here (when it's surfaced in Art Variant instead). */
  hideSigned?: boolean;
}

/**
 * A tri-state flag row inside the More menu: a check for include, a minus for
 * exclude, nothing when off. Clicking cycles off → include → exclude without
 * closing the menu, mirroring the panel's {@link FlagBadge} and the combobox's
 * flag row.
 * @returns The flag menu item.
 */
function FlagMenuItem({
  label,
  state,
  count,
  onToggle,
}: {
  label: string;
  state: boolean | null;
  count?: number;
  onToggle: () => void;
}) {
  const isZero = count !== undefined && count === 0;
  return (
    <DropdownMenuItem
      closeOnClick={false}
      onClick={onToggle}
      className={cn("pr-8", isZero && state === null && "opacity-40")}
    >
      <span className="flex-1">
        {label}
        {count !== undefined && (
          <span className="text-muted-foreground text-2xs ml-1.5 tabular-nums">({count})</span>
        )}
      </span>
      {state !== null && (
        <span className="absolute right-2 flex size-4 items-center justify-center">
          {state ? <CheckIcon className="size-4" /> : <MinusIcon className="size-4" />}
        </span>
      )}
    </DropdownMenuItem>
  );
}

interface DimensionOption {
  value: string;
  label: string;
  /** Optional faceted match count, rendered after the label and dimmed at zero. */
  count?: number;
}

/**
 * Above this option count a dimension renders as a searchable combobox (full
 * keyboard navigation: type to filter, ↓ to first row, ↑ to last) rather than a
 * plain checkbox submenu — a menu submenu can't host a working search field.
 * Short lists (Owned's 4 buckets, small marker sets) stay as submenus.
 */
const SEARCH_THRESHOLD = 8;

/**
 * One short multi-select dimension as a plain checkbox submenu (no search). The
 * trigger carries the dimension label plus an active-selection count; each row
 * shows its faceted count when available.
 * @returns The dimension submenu, or null when it has no options.
 */
function DimensionSubmenu({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: readonly DimensionOption[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  if (options.length === 0) {
    return null;
  }
  const activeCount = options.filter((option) => selected.includes(option.value)).length;
  return (
    <DropdownMenuSub>
      {/* Open on click, not hover, so a short submenu matches the click-to-open
          combobox rows the long dimensions use — otherwise Owned would fly out
          on hover while Distribution Channels needs a click. */}
      <DropdownMenuSubTrigger openOnHover={false}>
        <span className="flex-1">{label}</span>
        {activeCount > 0 && (
          <span className="text-muted-foreground tabular-nums">({activeCount})</span>
        )}
      </DropdownMenuSubTrigger>
      {/* Portals out of the menu content, so it needs the neutral-hover scope too. */}
      <DropdownMenuSubContent className={NEUTRAL_HOVER_SCOPE}>
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.value}
            checked={selected.includes(option.value)}
            onCheckedChange={() => onToggle(option.value)}
          >
            {/* Wrap long labels (e.g. channel breadcrumb paths) instead of
                truncating, matching the combobox rows the menu replaces. */}
            <span className="min-w-0 flex-1 break-words whitespace-normal">
              {option.label}
              {option.count !== undefined && (
                <span
                  className={cn(
                    "text-muted-foreground text-2xs ml-1.5 tabular-nums",
                    option.count === 0 && "opacity-50",
                  )}
                >
                  ({option.count})
                </span>
              )}
            </span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

/**
 * One multi-select dimension inside the More menu, picking the control by size:
 * a long list opens a searchable {@link MultiSelectCombobox} (rendered as a menu
 * row, with proper keyboard search), a short list stays a plain checkbox
 * submenu. `onToggle` flips a single value (submenu rows); `onChange` replaces
 * the whole selection (combobox). Faceted counts on the options flow to both.
 * @returns The dimension's submenu or combobox row, or null when it has no options.
 */
function MoreDimension({
  label,
  options,
  selected,
  onToggle,
  onChange,
  searchPlaceholder,
  emptyText,
}: {
  label: string;
  options: readonly DimensionOption[];
  selected: string[];
  onToggle: (value: string) => void;
  onChange: (next: string[]) => void;
  searchPlaceholder: string;
  emptyText: string;
}) {
  if (options.length === 0) {
    return null;
  }
  if (options.length > SEARCH_THRESHOLD) {
    const counts = new Map(
      options.flatMap((option) =>
        option.count === undefined ? [] : [[option.value, option.count]],
      ),
    );
    return (
      <MultiSelectCombobox
        triggerStyle="menu"
        label={label}
        options={options}
        selected={selected}
        onChange={onChange}
        searchPlaceholder={searchPlaceholder}
        emptyText={emptyText}
        counts={counts.size > 0 ? counts : undefined}
      />
    );
  }
  return (
    <DimensionSubmenu label={label} options={options} selected={selected} onToggle={onToggle} />
  );
}

/**
 * A single market range slider (Price or Copies) as a block inside the More
 * menu. The slider is a focusable widget, not a menu item: the menu's
 * arrow-key navigation lives on the popup and bubbles up, so we stop keydown
 * here and the slider's own arrow/Home/End handling wins.
 * @returns The wrapped range slider row.
 */
function MarketSliderBlock({
  scope,
  availableFilters,
  filterCounts,
  hiddenSections,
  ownedCountMax,
}: {
  scope: "price" | "copies";
  availableFilters: AvailableFilters;
  filterCounts?: FilterCounts;
  hiddenSections?: ReadonlySet<string>;
  ownedCountMax?: number;
}) {
  return (
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- the wrapper only guards keydown bubbling; the focusable control is its slider child
    <div
      // The other menu rows highlight via the menu's roving focus (focus:bg-accent);
      // a slider block isn't a menu item, so we highlight it on hover and while the
      // slider child is focused. bg-accent resolves to the neutral muted set by the
      // menu's NEUTRAL_HOVER_SCOPE, so it matches every other row's hover.
      className="hover:bg-accent focus-within:bg-accent rounded-md px-1.5 py-1.5"
      onKeyDown={(event) => event.stopPropagation()}
    >
      <FilterRangeSections
        scope={scope}
        availableFilters={availableFilters}
        filterCounts={filterCounts}
        hiddenSections={hiddenSections}
        ownedCountMax={ownedCountMax}
        // Match the menu's other entries (text-sm, not the panel's muted
        // text-xs gutter) so the slider labels don't look out of place.
        labelClassName="text-inherit text-sm font-normal"
      />
    </div>
  );
}

/**
 * The compact filter bar's "More" entry point as a dropdown menu. Flags cycle
 * in place, each multi-value dimension opens as a submenu (short) or searchable
 * combobox (long), and the Price / Copies range sliders ride as rows. Entries
 * are grouped into themed blocks separated by dividers: distribution
 * (Promo / Signed / Markers / Channels / custom tags), collection (Owned /
 * Copies), legality (Banned / Errata), and Price on its own. Mirrors the render
 * guards in {@link FilterMoreSection} — keep the two in sync when adding or
 * removing a More dimension.
 * @returns The More menu, or null when no More content applies here.
 */
export function FilterMoreMenu({
  availableFilters,
  hiddenSections,
  visibleCustomTagCategories,
  filterCounts,
  ownedCountMax,
  activeCount,
  hideSigned = false,
}: FilterMoreMenuProps) {
  const { filterState } = useFilterValues();
  const {
    setArrayFilter,
    toggleArrayFilter,
    toggleSigned,
    togglePromo,
    toggleBanned,
    toggleErrata,
  } = useFilterActions();
  const channelBreadcrumbs = buildChannelBreadcrumbs(availableFilters.distributionChannels);
  const { byCategory: customTagsByCategory } = useCustomTagList();
  const visibleCategories = [...customTagsByCategory.entries()].filter(([category]) =>
    visibleCustomTagCategories === undefined ? true : visibleCustomTagCategories.has(category),
  );

  // Price and Copies ride at the foot of the menu as range sliders. Each only
  // applies when its data exists on this surface; FilterRangeSections gates the
  // same way internally, but we mirror the checks here to drive the divider and
  // the empty-menu guard.
  const showPrice = !hiddenSections?.has("price") && availableFilters.price.max > 0;
  const showCopies =
    !hiddenSections?.has("owned") && ownedCountMax !== undefined && ownedCountMax > 0;
  const showMarketRanges = showPrice || showCopies;

  const hasDiscreteContent = useHasMoreSectionContent({
    availableFilters,
    hiddenSections,
    visibleCustomTagCategories,
    hideSigned,
  });
  if (!hasDiscreteContent && !showMarketRanges) {
    return null;
  }

  const showPromo = availableFilters.hasAnyMarker && !hiddenSections?.has("promo");
  const showSigned = !hideSigned && availableFilters.hasSigned && !hiddenSections?.has("signed");
  const showBanned = availableFilters.hasBanned && !hiddenSections?.has("banned");
  const showErrata = availableFilters.hasErrata && !hiddenSections?.has("errata");
  const showMarkers = !hiddenSections?.has("markers") && availableFilters.markers.length > 0;
  const showChannels =
    !hiddenSections?.has("channels") && availableFilters.distributionChannels.length > 0;
  const showCustomTags = !hiddenSections?.has("customTags") && visibleCategories.length > 0;
  const showOwned = !hiddenSections?.has("owned");

  const promoNode = showPromo ? (
    <FlagMenuItem
      key="promo"
      label={filterState.promo === false ? "Not Promo" : "Promo"}
      state={filterState.promo}
      count={filterCounts?.flags.promo}
      onToggle={togglePromo}
    />
  ) : null;
  const signedNode = showSigned ? (
    <FlagMenuItem
      key="signed"
      label={filterState.signed === false ? "Not Signed" : "Signed"}
      state={filterState.signed}
      count={filterCounts?.flags.signed}
      onToggle={toggleSigned}
    />
  ) : null;
  const bannedNode = showBanned ? (
    <FlagMenuItem
      key="banned"
      label={filterState.banned === false ? "Not Banned" : "Banned"}
      state={filterState.banned}
      count={filterCounts?.flags.banned}
      onToggle={toggleBanned}
    />
  ) : null;
  const errataNode = showErrata ? (
    <FlagMenuItem
      key="errata"
      label={filterState.errata === false ? "No Errata" : "Errata"}
      state={filterState.errata}
      count={filterCounts?.flags.errata}
      onToggle={toggleErrata}
    />
  ) : null;

  const markersNode = showMarkers ? (
    <MoreDimension
      key="markers"
      label="Markers"
      options={availableFilters.markers.map((marker) => ({
        value: marker.slug,
        label: marker.label,
        count: filterCounts?.markers.get(marker.slug),
      }))}
      selected={filterState.markers}
      onToggle={(value) => toggleArrayFilter("markers", value)}
      onChange={(next) => setArrayFilter("markers", next)}
      searchPlaceholder="Search markers…"
      emptyText="No markers match."
    />
  ) : null;
  const channelsNode = showChannels ? (
    <MoreDimension
      key="channels"
      label="Distribution Channels"
      options={availableFilters.distributionChannels.map((channel) => ({
        value: channel.slug,
        label: channelBreadcrumbs.get(channel.id) ?? channel.label,
        count: filterCounts?.channels.get(channel.slug),
      }))}
      selected={filterState.channels}
      onToggle={(value) => toggleArrayFilter("channels", value)}
      onChange={(next) => setArrayFilter("channels", next)}
      searchPlaceholder="Search distribution channels…"
      emptyText="No distribution channels match."
    />
  ) : null;
  const customTagNodes = showCustomTags
    ? visibleCategories.map(([category, tagsInCategory]) => {
        // `byCategory` groups from non-empty arrays, so the first tag always
        // exists and carries the joined category label from /init.
        const categoryLabel = tagsInCategory[0]?.categoryLabel ?? category;
        // All categories write to the one `customTags` key; the combobox path
        // replaces the whole selection, so merge this category's next values
        // with the slugs selected in the other categories.
        const categorySlugs = new Set(tagsInCategory.map((tag) => tag.slug));
        const selectedInCategory = filterState.customTags.filter((slug) => categorySlugs.has(slug));
        const selectedOutsideCategory = filterState.customTags.filter(
          (slug) => !categorySlugs.has(slug),
        );
        return (
          <MoreDimension
            key={category}
            label={categoryLabel}
            options={tagsInCategory.map((tag) => ({ value: tag.slug, label: tag.label }))}
            selected={selectedInCategory}
            onToggle={(value) => toggleArrayFilter("customTags", value)}
            onChange={(next) => setArrayFilter("customTags", [...selectedOutsideCategory, ...next])}
            searchPlaceholder={`Search ${categoryLabel.toLowerCase()}…`}
            emptyText={`No ${categoryLabel.toLowerCase()} match.`}
          />
        );
      })
    : [];
  const ownedNode = showOwned ? (
    <MoreDimension
      key="owned"
      label="Owned"
      options={OWNED_BUCKETS.map((bucket) => ({ value: bucket.value, label: bucket.label }))}
      selected={filterState.owned}
      onToggle={(value) => toggleArrayFilter("owned", value)}
      onChange={(next) => setArrayFilter("owned", next)}
      searchPlaceholder="Search owned…"
      emptyText="No options match."
    />
  ) : null;
  const copiesNode = showCopies ? (
    <MarketSliderBlock
      key="copies"
      scope="copies"
      availableFilters={availableFilters}
      filterCounts={filterCounts}
      hiddenSections={hiddenSections}
      ownedCountMax={ownedCountMax}
    />
  ) : null;
  const priceNode = showPrice ? (
    <MarketSliderBlock
      key="price"
      scope="price"
      availableFilters={availableFilters}
      filterCounts={filterCounts}
      hiddenSections={hiddenSections}
    />
  ) : null;

  // Themed blocks, separated by dividers; empty blocks collapse away.
  //  • Distribution: Promo, Signed, Markers, Distribution Channels, custom tags
  //  • Collection:   Owned, Copies
  //  • Legality:     Banned, Errata
  //  • Price on its own
  const blocks = [
    {
      id: "distribution",
      items: [promoNode, signedNode, markersNode, channelsNode, ...customTagNodes],
    },
    { id: "collection", items: [ownedNode, copiesNode] },
    { id: "legality", items: [bannedNode, errataNode] },
    { id: "price", items: [priceNode] },
  ]
    .map((block) => ({ id: block.id, items: block.items.filter(Boolean) }))
    .filter((block) => block.items.length > 0);

  const active = activeCount > 0;
  // When exactly one More entry is active, the trigger reflects that entry by
  // name — like the value dropdowns do (Type → "Unit") — instead of a bare
  // "More (1)". Ranges have no single value, so they surface their dimension
  // name. The order and gating mirror the parent's `activeCount`, so a single
  // entry here always lines up with `activeCount === 1`.
  const singleActiveLabel = ((): string | undefined => {
    const markerLabels = new Map(
      availableFilters.markers.map((marker) => [marker.slug, marker.label]),
    );
    const channelLabels = new Map(
      availableFilters.distributionChannels.map((channel) => [
        channel.slug,
        channelBreadcrumbs.get(channel.id) ?? channel.label,
      ]),
    );
    const tagLabels = new Map(
      [...customTagsByCategory.values()].flat().map((tag) => [tag.slug, tag.label]),
    );
    const ownedLabels = new Map(OWNED_BUCKETS.map((bucket) => [bucket.value, bucket.label]));
    const entries: string[] = [];
    if (filterState.promo !== null) {
      entries.push(filterState.promo === false ? "Not Promo" : "Promo");
    }
    if (!hideSigned && filterState.signed !== null) {
      entries.push(filterState.signed === false ? "Not Signed" : "Signed");
    }
    if (filterState.banned !== null) {
      entries.push(filterState.banned === false ? "Not Banned" : "Banned");
    }
    if (filterState.errata !== null) {
      entries.push(filterState.errata === false ? "No Errata" : "Errata");
    }
    for (const slug of filterState.markers) {
      entries.push(markerLabels.get(slug) ?? slug);
    }
    for (const slug of filterState.channels) {
      entries.push(channelLabels.get(slug) ?? slug);
    }
    for (const slug of filterState.customTags) {
      entries.push(tagLabels.get(slug) ?? slug);
    }
    for (const value of filterState.owned) {
      entries.push(ownedLabels.get(value) ?? value);
    }
    if (filterState.priceMin !== null || filterState.priceMax !== null) {
      entries.push("Price");
    }
    if (filterState.ownedCountMin !== null || filterState.ownedCountMax !== null) {
      entries.push("Copies");
    }
    return entries.length === 1 ? entries[0] : undefined;
  })();
  return (
    <DropdownMenu>
      {/* Same button language as the value dropdowns and the Stats chip: outline
          matched to the Domain/Rarity toggle group (transparent resting, muted
          when active) rather than the primary fill. */}
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "font-medium",
              FILTER_TRIGGER_CLASS,
              active && FILTER_TRIGGER_ACTIVE_CLASS,
            )}
          />
        }
        aria-label={
          singleActiveLabel
            ? `More filters: ${singleActiveLabel}`
            : active
              ? `More, ${activeCount} selected`
              : "More"
        }
      >
        {singleActiveLabel ?? "More"}
        {active && !singleActiveLabel && <span className="tabular-nums">({activeCount})</span>}
        <ChevronDownIcon />
      </DropdownMenuTrigger>
      {/* Widen to fit the slider rows when Price/Copies are present. */}
      <DropdownMenuContent
        align="start"
        className={cn(NEUTRAL_HOVER_SCOPE, showMarketRanges ? "w-80" : "min-w-56")}
      >
        {blocks.map((block, index) => (
          <Fragment key={block.id}>
            {index > 0 && <DropdownMenuSeparator />}
            {block.items}
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

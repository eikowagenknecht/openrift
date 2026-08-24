import type { AvailableFilters, FilterCounts, PresenceDimension } from "@openrift/shared";
import { CheckIcon, ChevronDownIcon, MinusIcon } from "lucide-react";
import { Fragment } from "react";

import { FilterRangeSections } from "@/components/filters/filter-range-sections";
import {
  FilterValueDropdown,
  FilterVariantDropdown,
} from "@/components/filters/filter-value-dropdown";
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
import { useCustomTagList, useTagCategories } from "@/hooks/use-enums";
import {
  useSingleActiveFilterLabel,
  useVisibleFilterDimensions,
} from "@/hooks/use-filter-dimensions";
import { filterDimension, OWNED_BUCKETS } from "@/lib/filter-dimensions";
import { nextOversize, oversizeCount, oversizeState } from "@/lib/oversize-filter";
import type { PresenceParamValue } from "@/lib/presence-filter";
import { PRESENCE_LABELS, presenceFlagCount, presenceToFlagState } from "@/lib/presence-filter";
import { groupTagsByCategory } from "@/lib/tag-category-groups";
import { cn } from "@/lib/utils";

interface FilterMoreMenuProps {
  availableFilters: AvailableFilters;
  availableLanguages?: string[];
  setDisplayLabel?: (code: string) => string;
  hiddenSections?: ReadonlySet<string>;
  /** See {@link FilterPanelContentProps.visibleCustomTagCategories}. */
  visibleCustomTagCategories?: ReadonlySet<string>;
  filterCounts?: FilterCounts;
  /** Upper bound for the Copies range slider; see {@link FilterPanelContentProps.ownedCountMax}. */
  ownedCountMax?: number;
  /** Active selections across every More dimension; shown as "(n)" on the trigger. */
  activeCount: number;
  /**
   * The user's top-level placement units (see `lib/filter-sections.ts`). The
   * menu hosts every applicable unit NOT in this set — including demoted core
   * dimensions like Set or Domain.
   */
  topLevelUnits: ReadonlySet<string>;
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
 * One multi-select dimension inside the More menu. An exclude-capable dimension
 * (it passes `excluded` + `onCycle`) always renders as a searchable
 * {@link MultiSelectCombobox} whose rows cycle off → include → exclude → off
 * (ADR-034), since a checkbox submenu can't host the tri-state. An include-only
 * dimension (Owned) keeps the size-based split: a long list opens the searchable
 * combobox, a short one stays a plain checkbox submenu. Faceted counts flow to
 * every path.
 * @returns The dimension's submenu or combobox row, or null when it has no options.
 */
function MoreDimension({
  label,
  options,
  included,
  onIncludeChange,
  onIncludeToggle,
  excluded,
  onCycle,
  searchPlaceholder,
  emptyText,
  flag,
}: {
  label: string;
  options: readonly DimensionOption[];
  included: string[];
  /** Plain multi-select handler for the include-only path (Owned). */
  onIncludeChange?: (next: string[]) => void;
  /** Single-value include toggle for the checkbox submenu (include-only path). */
  onIncludeToggle?: (value: string) => void;
  excluded?: string[];
  /** Tri-state cycle for the exclude-capable path. */
  onCycle?: (value: string) => void;
  searchPlaceholder: string;
  emptyText: string;
  /**
   * Optional tri-state flag folded into the top of the combobox (e.g. a "Has
   * any …" presence toggle above the specific values). Only honoured on the
   * combobox path (exclude-capable dimensions like Markers / Channels).
   */
  flag?: { label: string; state: boolean | null; count?: number; onToggle: () => void };
}) {
  if (options.length === 0) {
    return null;
  }
  const counts = new Map(
    options.flatMap((option) => (option.count === undefined ? [] : [[option.value, option.count]])),
  );
  const facetedCounts = counts.size > 0 ? counts : undefined;
  const excludeCapable = excluded !== undefined && onCycle !== undefined;
  // The checkbox submenu is the include-only short-list path; everything else
  // (exclude-capable, a long list, or a caller that gave no submenu toggle)
  // renders the searchable combobox.
  if (excludeCapable || options.length > SEARCH_THRESHOLD || onIncludeToggle === undefined) {
    return (
      <MultiSelectCombobox
        triggerStyle="menu"
        label={label}
        options={options}
        selected={included}
        onChange={excludeCapable ? undefined : onIncludeChange}
        excluded={excludeCapable ? excluded : undefined}
        onCycle={excludeCapable ? onCycle : undefined}
        searchPlaceholder={searchPlaceholder}
        emptyText={emptyText}
        counts={facetedCounts}
        flag={flag}
        flagPosition="top"
      />
    );
  }
  return (
    <DimensionSubmenu
      label={label}
      options={options}
      selected={included}
      onToggle={onIncludeToggle}
    />
  );
}

/**
 * A range-slider block (Price, Copies, or the three stat sliders) inside the
 * More menu. The sliders are focusable widgets, not menu items: the menu's
 * arrow-key navigation lives on the popup and bubbles up, so we stop keydown
 * here and the slider's own arrow/Home/End handling wins.
 * @returns The wrapped range slider row(s).
 */
function RangeSliderBlock({
  scope,
  availableFilters,
  filterCounts,
  hiddenSections,
  ownedCountMax,
}: {
  scope: "price" | "copies" | "stats";
  availableFilters: AvailableFilters;
  filterCounts?: FilterCounts;
  hiddenSections?: ReadonlySet<string>;
  ownedCountMax?: number;
}) {
  return (
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- the wrapper only guards keydown bubbling; the focusable controls are its slider children
    <div
      // The other menu rows highlight via the menu's roving focus (focus:bg-accent);
      // a slider block isn't a menu item, so we highlight it on hover and while a
      // slider child is focused. bg-accent resolves to the neutral muted set by the
      // menu's NEUTRAL_HOVER_SCOPE, so it matches every other row's hover.
      className="hover:bg-accent focus-within:bg-accent flex flex-col gap-1.5 rounded-md px-1.5 py-1.5"
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
 * The compact filter bar's "More" entry point as a dropdown menu, hosting
 * every placement unit the user hasn't promoted to the top level. Flags cycle
 * in place, each multi-value dimension opens as a submenu (short) or
 * searchable combobox (long), and the range dimensions (Stats, Price, Copies)
 * ride as slider rows. Entries are grouped into themed blocks separated by
 * dividers: core card dimensions (Language … Stats, when demoted),
 * distribution (Signed / Standard / Oversized / Markers / Channels / Keywords
 * / custom tags), collection (Owned / Copies), legality (Banned / Errata), and
 * Price on its own.
 * @returns The More menu, or null when no More content applies here.
 */
export function FilterMoreMenu({
  availableFilters,
  availableLanguages,
  setDisplayLabel,
  hiddenSections,
  visibleCustomTagCategories,
  filterCounts,
  ownedCountMax,
  activeCount,
  topLevelUnits,
}: FilterMoreMenuProps) {
  const { filterState } = useFilterValues();
  const {
    setArrayFilter,
    cycleArrayFilter,
    toggleArrayFilter,
    toggleSigned,
    cyclePresence,
    toggleBanned,
    toggleErrata,
    toggleStandard,
  } = useFilterActions();
  const visibleDimensions = useVisibleFilterDimensions({
    availableFilters,
    availableLanguages,
    hiddenSections,
    visibleCustomTagCategories,
    ownedCountMax,
  });
  const singleActiveLabel = useSingleActiveFilterLabel({
    availableFilters,
    setDisplayLabel,
    topLevelUnits,
  });
  const { byCategory: customTagsByCategory } = useCustomTagList();
  const visibleCategories = [...customTagsByCategory.entries()].filter(([category]) =>
    visibleCustomTagCategories === undefined ? true : visibleCustomTagCategories.has(category),
  );
  // Printed tags: values from AvailableFilters, category grouping from /init.
  const { categories: tagCategories, categoryByTag } = useTagCategories();
  const tagGroups = groupTagsByCategory(availableFilters.tags, tagCategories, categoryByTag);

  // One predicate per dimension, from the registry: the axis has content the
  // surface hasn't hidden, and its placement unit is demoted here. The Variant
  // and Stats units resolve through their own axes (artVariants / finishes /
  // signed, energy / might / power), so a per-axis hide still works.
  const shows = (key: string) =>
    visibleDimensions.has(key) && !topLevelUnits.has(filterDimension(key).unit);

  const showArtVariantSection = shows("artVariants");
  const showFinishSection = shows("finishes");
  const showVariantRow = showArtVariantSection || showFinishSection;
  // Signed belongs to the Variant unit: it rides the Variant row's flag when
  // the Art Variant axis renders here, and falls back to its own flag row when
  // the unit is demoted without that axis (mirroring FilterChipSections).
  const signedInVariantRow = shows("signed") && showArtVariantSection;
  const showSignedRow = shows("signed") && !signedInVariantRow;
  const showStats = shows("energy") || shows("might") || shows("power");
  const showPrice = shows("price");
  const showOwned = shows("owned");
  const showCopies = shows("copies");
  const showCustomTags = shows("customTags");
  const showTags = shows("tags");

  // Markers, Distribution Channels and Keywords fold their any/none presence
  // into the top of their own picker (see FilterValueDropdown). Custom tags and
  // printed tags render several category pickers with no single picker to fold
  // into, so their presence rides as its own tri-state row.
  const presenceRow = (dimension: PresenceDimension, value: PresenceParamValue, shown: boolean) => {
    if (!shown) {
      return null;
    }
    const state = presenceToFlagState(value);
    return (
      <FlagMenuItem
        key={`presence-${dimension}`}
        label={PRESENCE_LABELS[dimension]}
        state={state}
        count={presenceFlagCount(filterCounts?.presence[dimension], state)}
        onToggle={() => cyclePresence(dimension)}
      />
    );
  };
  const customTagsPresenceNode = presenceRow(
    "customTags",
    filterState.customTagsPresence,
    showCustomTags,
  );
  // Printed tags mirror custom tags: several per-category pickers, so their
  // any/none presence rides as its own row.
  const tagsPresenceNode = presenceRow("tags", filterState.tagsPresence, showTags);

  // Every value dimension renders through the shared dropdown, so the menu's
  // rows and the compact bar's chips come from one definition per axis.
  const dropdownProps = { availableFilters, availableLanguages, setDisplayLabel, filterCounts };
  const dropdownRow = (key: string) =>
    shows(key) ? (
      <FilterValueDropdown key={key} dimension={key} triggerStyle="menu" {...dropdownProps} />
    ) : null;
  const variantNode = showVariantRow ? (
    <FilterVariantDropdown
      key="variant"
      triggerStyle="menu"
      availableFilters={availableFilters}
      filterCounts={filterCounts}
      showArtVariant={showArtVariantSection}
      showFinish={showFinishSection}
      showSignedFlag={signedInVariantRow}
    />
  ) : null;
  const statsNode = showStats ? (
    <RangeSliderBlock
      key="stats"
      scope="stats"
      availableFilters={availableFilters}
      filterCounts={filterCounts}
      hiddenSections={hiddenSections}
    />
  ) : null;

  // ── Chip dimension rows ────────────────────────────────────────────────────
  const showOversizeNode = shows("cardSizes");
  const oversizeState_ = oversizeState(filterState.cardSizes);
  const oversizeNode = showOversizeNode ? (
    <FlagMenuItem
      key="oversize"
      label="Oversized"
      state={oversizeState_}
      count={oversizeCount(filterCounts?.cardSizes, oversizeState_)}
      onToggle={() => setArrayFilter("cardSizes", nextOversize(filterState.cardSizes))}
    />
  ) : null;
  const signedNode = showSignedRow ? (
    <FlagMenuItem
      key="signed"
      label="Signed"
      state={filterState.signed}
      count={filterCounts?.flags.signed}
      onToggle={toggleSigned}
    />
  ) : null;
  const bannedNode = shows("banned") ? (
    <FlagMenuItem
      key="banned"
      label="Banned"
      state={filterState.banned}
      count={filterCounts?.flags.banned}
      onToggle={toggleBanned}
    />
  ) : null;
  const errataNode = shows("errata") ? (
    <FlagMenuItem
      key="errata"
      label="Errata"
      state={filterState.errata}
      count={filterCounts?.flags.errata}
      onToggle={toggleErrata}
    />
  ) : null;
  const standardNode = shows("standard") ? (
    <FlagMenuItem
      key="standard"
      label="Standard"
      state={filterState.standard}
      count={filterCounts?.flags.standard}
      onToggle={toggleStandard}
    />
  ) : null;

  const customTagNodes = showCustomTags
    ? visibleCategories.map(([category, tagsInCategory]) => {
        // `byCategory` groups from non-empty arrays, so the first tag always
        // exists and carries the joined category label from /init.
        const categoryLabel = tagsInCategory[0]?.categoryLabel ?? category;
        // All categories write to the one `customTags` / `customTagsEx` key; the
        // cycle operates on the full arrays by value, so other categories' slugs
        // are untouched. Slice this category's slugs for the dropdown's display.
        const categorySlugs = new Set(tagsInCategory.map((tag) => tag.slug));
        const selectedInCategory = filterState.customTags.filter((slug) => categorySlugs.has(slug));
        const excludedInCategory = filterState.customTagsEx.filter((slug) =>
          categorySlugs.has(slug),
        );
        return (
          <MoreDimension
            key={category}
            label={categoryLabel}
            options={tagsInCategory.map((tag) => ({ value: tag.slug, label: tag.label }))}
            included={selectedInCategory}
            excluded={excludedInCategory}
            onCycle={(value) => cycleArrayFilter("customTags", "customTagsEx", value)}
            searchPlaceholder={`Search ${categoryLabel.toLowerCase()}…`}
            emptyText={`No ${categoryLabel.toLowerCase()} match.`}
          />
        );
      })
    : [];
  const tagNodes = showTags
    ? tagGroups.map((group) => {
        // All categories write to the one `tags` / `tagsEx` key; slice this
        // category's values for the dropdown's display (values are the exact
        // printed strings, so they label themselves).
        const groupValues = new Set(group.tags);
        const selectedInGroup = filterState.tags.filter((tag) => groupValues.has(tag));
        const excludedInGroup = filterState.tagsEx.filter((tag) => groupValues.has(tag));
        return (
          <MoreDimension
            key={`tags-${group.slug}`}
            label={group.label}
            options={group.tags.map((tag) => ({
              value: tag,
              label: tag,
              count: filterCounts?.tags.get(tag),
            }))}
            included={selectedInGroup}
            excluded={excludedInGroup}
            onCycle={(value) => cycleArrayFilter("tags", "tagsEx", value)}
            searchPlaceholder={`Search ${group.label.toLowerCase()}…`}
            emptyText={`No ${group.label.toLowerCase()} match.`}
          />
        );
      })
    : [];
  const ownedNode = showOwned ? (
    <MoreDimension
      key="owned"
      label="Owned"
      options={OWNED_BUCKETS.map((bucket) => ({ value: bucket.value, label: bucket.label }))}
      included={filterState.owned}
      onIncludeChange={(next) => setArrayFilter("owned", next)}
      onIncludeToggle={(value) => toggleArrayFilter("owned", value)}
      searchPlaceholder="Search owned…"
      emptyText="No options match."
    />
  ) : null;
  const copiesNode = showCopies ? (
    <RangeSliderBlock
      key="copies"
      scope="copies"
      availableFilters={availableFilters}
      filterCounts={filterCounts}
      hiddenSections={hiddenSections}
      ownedCountMax={ownedCountMax}
    />
  ) : null;
  const priceNode = showPrice ? (
    <RangeSliderBlock
      key="price"
      scope="price"
      availableFilters={availableFilters}
      filterCounts={filterCounts}
      hiddenSections={hiddenSections}
    />
  ) : null;

  // Themed blocks, separated by dividers; empty blocks collapse away. The row
  // order mirrors the compact bar's chip order exactly (the canonical
  // FILTER_PLACEMENT_UNITS order), so a unit sits in the same spot whether
  // it's promoted or demoted. Markers / Distribution Channels fold their
  // any/none presence into the picker itself; custom-tag and keyword presence
  // ride as their own rows.
  //  • Core:       Language, Sets, Domain, Rarity, Type, Supertype, Variant, Standard, Stats
  //  • Dimensions: Markers, Oversized (Size), Channels, custom tags, Keywords
  //  • Flags:      Signed, Banned, Errata
  //  • Market:     Owned, Copies, Price
  const blocks = [
    {
      id: "core",
      items: [
        dropdownRow("languages"),
        dropdownRow("sets"),
        dropdownRow("domains"),
        dropdownRow("rarities"),
        dropdownRow("types"),
        dropdownRow("superTypes"),
        variantNode,
        standardNode,
        statsNode,
      ],
    },
    {
      id: "dimensions",
      items: [
        dropdownRow("markers"),
        oversizeNode,
        dropdownRow("channels"),
        ...customTagNodes,
        customTagsPresenceNode,
        ...tagNodes,
        tagsPresenceNode,
        dropdownRow("keywords"),
      ],
    },
    { id: "flags", items: [signedNode, bannedNode, errataNode] },
    { id: "market", items: [ownedNode, copiesNode, priceNode] },
  ]
    .map((block) => ({ id: block.id, items: block.items.filter(Boolean) }))
    .filter((block) => block.items.length > 0);

  if (blocks.length === 0) {
    return null;
  }
  const showWideContent = showPrice || showCopies || showStats;

  const active = activeCount > 0;
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
      {/* Widen to fit the slider rows when Stats/Price/Copies are present. */}
      <DropdownMenuContent
        align="start"
        className={cn(NEUTRAL_HOVER_SCOPE, showWideContent ? "w-80" : "min-w-56")}
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

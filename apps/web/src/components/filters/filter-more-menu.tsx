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
  /** See {@link FilterPanelContentProps.ownedCountMax}. */
  ownedCountMax?: number;
  activeCount: number;
  /** Menu hosts every applicable unit not in this set, including demoted core dimensions. */
  topLevelUnits: ReadonlySet<string>;
}

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
  count?: number;
}

// Above this option count, a menu submenu can't host a working search field,
// so the dimension renders as a combobox instead.
const SEARCH_THRESHOLD = 8;

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
      <DropdownMenuSubTrigger openOnHover={false}>
        <span className="flex-1">{label}</span>
        {activeCount > 0 && (
          <span className="text-muted-foreground tabular-nums">({activeCount})</span>
        )}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.value}
            checked={selected.includes(option.value)}
            onCheckedChange={() => onToggle(option.value)}
          >
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
  onIncludeChange?: (next: string[]) => void;
  onIncludeToggle?: (value: string) => void;
  excluded?: string[];
  onCycle?: (value: string) => void;
  searchPlaceholder: string;
  emptyText: string;
  /** Only honoured on the combobox path (exclude-capable dimensions), not the submenu. */
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
        flags={flag ? [flag] : undefined}
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
      className="hover:bg-muted focus-within:bg-muted flex flex-col gap-1.5 rounded-md px-1.5 py-1.5"
      // Stops the menu's roving-focus keydown handling so the slider's own arrow/Home/End keys work.
      onKeyDown={(event) => event.stopPropagation()}
    >
      <FilterRangeSections
        scope={scope}
        availableFilters={availableFilters}
        filterCounts={filterCounts}
        hiddenSections={hiddenSections}
        ownedCountMax={ownedCountMax}
        labelClassName="text-inherit text-sm font-normal"
      />
    </div>
  );
}

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
    toggleOvernumbered,
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
  const { categories: tagCategories, categoryByTag } = useTagCategories();
  const tagGroups = groupTagsByCategory(availableFilters.tags, tagCategories, categoryByTag);

  // Variant and Stats resolve through their own axes (artVariants / finishes /
  // signed, energy / might / power), so a per-axis hide still applies to them.
  const shows = (key: string) =>
    visibleDimensions.has(key) && !topLevelUnits.has(filterDimension(key).unit);

  const showArtVariantSection = shows("artVariants");
  const showFinishSection = shows("finishes");
  const showVariantRow = showArtVariantSection || showFinishSection;
  const signedInVariantRow = shows("signed") && showArtVariantSection;
  const showSignedRow = shows("signed") && !signedInVariantRow;
  const overnumberedInVariantRow = shows("overnumbered") && showArtVariantSection;
  const showOvernumberedRow = shows("overnumbered") && !overnumberedInVariantRow;
  const showStats = shows("energy") || shows("might") || shows("power");
  const showPrice = shows("price");
  const showOwned = shows("owned");
  const showCopies = shows("copies");
  const showCustomTags = shows("customTags");
  const showTags = shows("tags");

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
  const tagsPresenceNode = presenceRow("tags", filterState.tagsPresence, showTags);

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
      showOvernumberedFlag={overnumberedInVariantRow}
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
  const overnumberedNode = showOvernumberedRow ? (
    <FlagMenuItem
      key="overnumbered"
      label="Overnumbered"
      state={filterState.overnumbered}
      count={filterCounts?.flags.overnumbered}
      onToggle={toggleOvernumbered}
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
        const categoryLabel = tagsInCategory[0]?.categoryLabel ?? category;
        // Shared `customTags`/`customTagsEx` keys across categories; slice per category.
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
    { id: "flags", items: [overnumberedNode, signedNode, bannedNode, errataNode] },
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
      <DropdownMenuContent align="start" className={cn(showWideContent ? "w-80" : "min-w-56")}>
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

import type { AvailableFilters, FilterCounts } from "@openrift/shared";
import { ChevronDownIcon } from "lucide-react";
import type { ReactNode } from "react";

import { CardIcon } from "@/components/card-icon";
import { FilterCustomizeControl } from "@/components/filters/filter-customize-control";
import { FilterMoreMenu } from "@/components/filters/filter-more-menu";
import {
  FilterRangeSections,
  useHasMoreSectionContent,
} from "@/components/filters/filter-panel-content";
import {
  FILTER_TRIGGER_ACTIVE_CLASS,
  FILTER_TRIGGER_CLASS,
  MultiSelectCombobox,
  NEUTRAL_HOVER_SCOPE,
} from "@/components/filters/multi-select-combobox";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useFilterActions, useFilterValues } from "@/hooks/use-card-filters";
import { useEnumOrders, useLanguageLabels } from "@/hooks/use-enums";
import { formatDomainFilterLabel } from "@/lib/domain";
import { getFilterIconPath } from "@/lib/icons";
import { cn } from "@/lib/utils";

interface CompactFilterBarProps {
  availableFilters: AvailableFilters;
  availableLanguages?: string[];
  setDisplayLabel?: (code: string) => string;
  hiddenSections?: ReadonlySet<string>;
  /** See {@link FilterPanelContentProps.visibleCustomTagCategories}. */
  visibleCustomTagCategories?: ReadonlySet<string>;
  filterCounts?: FilterCounts;
  /** See {@link FilterPanelContentProps.ownedCountMax}. */
  ownedCountMax?: number;
}

/**
 * Inline icon-toggle cluster for a small, stable, icon-bearing dimension
 * (Domain, Rarity). A connected segmented control (the same grouped-button look
 * as the deck list's domain filter); filters with a single click, no popover.
 * The text label and faceted count ride the tooltip / accessible name to keep
 * the bar compact.
 * @returns The labelled icon cluster.
 */
export function FilterIconCluster({
  label,
  options,
  selected,
  onChange,
  iconPath,
  displayLabel,
  counts,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  iconPath: (value: string) => string | undefined;
  displayLabel: (value: string) => string;
  counts?: Map<string, number>;
}) {
  if (options.length === 0) {
    return null;
  }
  // No text label — the icons carry the meaning; the group still names itself
  // for assistive tech via aria-label, and each option via its tooltip.
  return (
    <ToggleGroup
      multiple
      variant="outline"
      size="sm"
      value={selected}
      onValueChange={(next) => onChange(next as string[])}
      aria-label={`${label} filter`}
    >
      {options.map((option) => {
        const count = counts?.get(option);
        const icon = iconPath(option);
        const isSelected = selected.includes(option);
        const isZero = counts !== undefined && (count ?? 0) === 0;
        const optionLabel =
          count === undefined ? displayLabel(option) : `${displayLabel(option)} (${count})`;
        return (
          <Tooltip key={option}>
            <TooltipTrigger
              render={
                <ToggleGroupItem
                  value={option}
                  aria-label={optionLabel}
                  className={cn(isZero && !isSelected && "opacity-40")}
                />
              }
            >
              {icon ? <CardIcon src={icon} className="size-4" /> : displayLabel(option)}
            </TooltipTrigger>
            <TooltipContent>{optionLabel}</TooltipContent>
          </Tooltip>
        );
      })}
    </ToggleGroup>
  );
}

/**
 * A chip-styled popover trigger for one filter dimension. The trigger shows the
 * dimension label plus an active-selection count; the popover hosts the
 * dimension's controls (a badge grid, the stat sliders, or the More group).
 * @returns The chip trigger and its popover.
 */
export function FilterDropdownChip({
  label,
  activeCount,
  contentClassName,
  children,
}: {
  label: string;
  activeCount: number;
  contentClassName?: string;
  children: ReactNode;
}) {
  const active = activeCount > 0;
  return (
    <Popover>
      {/* Outline Button at size="sm" matches the Domain/Rarity ToggleGroup
          items (h-7, radius, padding); an active filter fills with primary —
          the same highlight the value dropdowns and the panel's selected
          badges use — so a set filter is unmistakable. */}
      <PopoverTrigger
        render={
          // Outline matched to the Domain/Rarity toggle group (transparent
          // resting, `bg-muted` when active), not the primary fill.
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
        aria-label={active ? `${label}, ${activeCount} selected` : label}
      >
        {label}
        {active && <span className="tabular-nums">({activeCount})</span>}
        <ChevronDownIcon />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn(NEUTRAL_HOVER_SCOPE, "w-max max-w-[90vw] min-w-64", contentClassName)}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}

/**
 * The compact card-browser filter bar: an alternative to the expanded
 * filter panel that collapses each dimension into either an inline icon
 * cluster (Domain, Rarity) or a dropdown chip (everything else). Rendered
 * in the above-the-grid area at mid widths when the user opts into the
 * compact filter view. Mirrors the section guards in `filter-panel-content.tsx`
 * — keep the two in sync when adding or removing a filter dimension.
 * @returns The compact filter bar.
 */
export function CompactFilterBar({
  availableFilters,
  availableLanguages,
  setDisplayLabel,
  hiddenSections,
  visibleCustomTagCategories,
  filterCounts,
  ownedCountMax,
}: CompactFilterBarProps) {
  const { labels } = useEnumOrders();
  const { filterState } = useFilterValues();
  const { setArrayFilter, toggleSigned } = useFilterActions();
  const languageLabels = useLanguageLabels();

  // Art Variant, Finish, and Signed are all printing-variant axes, so they share
  // one "Variant" dropdown to keep the bar from crowding. Each section only
  // appears when it has content; the menu shows whenever any of them does.
  const showArtVariantSection =
    !hiddenSections?.has("artVariants") && availableFilters.artVariants.length > 1;
  const showFinishSection =
    !hiddenSections?.has("finishes") && availableFilters.finishes.length > 1;
  const showVariantMenu = showArtVariantSection || showFinishSection;

  // Signed rides in the Variant dropdown when the Art Variant section is present
  // (mirroring the expanded panel); otherwise it stays in the More group.
  const signedInVariantMenu =
    availableFilters.hasSigned && !hiddenSections?.has("signed") && showArtVariantSection;

  const hasMoreContent = useHasMoreSectionContent({
    availableFilters,
    hiddenSections,
    visibleCustomTagCategories,
    hideSigned: signedInVariantMenu,
  });

  // Stats: the printed gameplay sliders only (Energy/Might/Power, always shown
  // unless hidden). Price and Copies are value/collection ranges, not card
  // stats, so they ride in the "More" menu instead — see showMarketRanges.
  const showStats =
    !hiddenSections?.has("energy") ||
    !hiddenSections?.has("might") ||
    !hiddenSections?.has("power");

  const statsActiveCount =
    Number(filterState.energyMin !== null || filterState.energyMax !== null) +
    Number(filterState.mightMin !== null || filterState.mightMax !== null) +
    Number(filterState.powerMin !== null || filterState.powerMax !== null);

  // Price and Copies render as range sliders at the foot of the "More" menu,
  // below the flag/marker/channel/tag controls. Each only applies when its
  // data exists on this surface; the menu shows whenever either it or the
  // discrete More controls have content.
  const showPrice = !hiddenSections?.has("price") && availableFilters.price.max > 0;
  const showCopies =
    !hiddenSections?.has("owned") && ownedCountMax !== undefined && ownedCountMax > 0;
  const showMarketRanges = showPrice || showCopies;
  const hasMore = hasMoreContent || showMarketRanges;

  const moreActiveCount =
    Number(filterState.promo !== null) +
    Number(!signedInVariantMenu && filterState.signed !== null) +
    Number(filterState.banned !== null) +
    Number(filterState.errata !== null) +
    filterState.markers.length +
    filterState.channels.length +
    filterState.customTags.length +
    filterState.owned.length +
    Number(filterState.priceMin !== null || filterState.priceMax !== null) +
    Number(filterState.ownedCountMin !== null || filterState.ownedCountMax !== null);

  return (
    <TooltipProvider>
      {/* Order mirrors the expanded panel: Language, Set, Domain, Rarity, Type,
          Supertype, Variant (Art Variant + Finish + Signed), Stats, More. */}
      <div className="@wide:hidden mb-3 hidden flex-wrap items-center gap-1.5 sm:flex">
        {availableLanguages &&
          availableLanguages.length > 1 &&
          !hiddenSections?.has("languages") && (
            <MultiSelectCombobox
              triggerStyle="button"
              label="Language"
              searchPlaceholder="Search languages…"
              emptyText="No languages match."
              options={availableLanguages.map((value) => ({
                value,
                label: languageLabels[value] ?? value,
              }))}
              selected={filterState.languages}
              onChange={(next) => setArrayFilter("languages", next)}
              counts={filterCounts?.languages}
            />
          )}
        {!hiddenSections?.has("sets") && availableFilters.sets.length > 0 && (
          <MultiSelectCombobox
            triggerStyle="button"
            label="Sets"
            searchPlaceholder="Search sets…"
            emptyText="No sets match."
            options={availableFilters.sets.map((value) => {
              // `value` is the set code (e.g. "OGN"). Show it in a fixed-width
              // gutter (via `prefix`) ahead of the name so codes/names line up
              // down the list; the combobox folds it back into the trigger and
              // search text as "OGN — Origins".
              const name = setDisplayLabel?.(value) ?? value;
              return name === value
                ? { value, label: value }
                : { value, label: name, prefix: value };
            })}
            selected={filterState.sets}
            onChange={(next) => setArrayFilter("sets", next)}
            counts={filterCounts?.sets}
            mutedOptions={availableFilters.supplementalSets}
          />
        )}
        {!hiddenSections?.has("domains") && (
          <FilterIconCluster
            label="Domain"
            options={availableFilters.domains}
            selected={filterState.domains}
            onChange={(next) => setArrayFilter("domains", next)}
            iconPath={(value) => getFilterIconPath("domains", value)}
            displayLabel={(value) => formatDomainFilterLabel(value, labels.domains)}
            counts={filterCounts?.domains}
          />
        )}
        <FilterIconCluster
          label="Rarity"
          options={availableFilters.rarities}
          selected={filterState.rarities}
          onChange={(next) => setArrayFilter("rarities", next)}
          iconPath={(value) => getFilterIconPath("rarities", value)}
          displayLabel={(value) => labels.rarities[value] ?? value}
          counts={filterCounts?.rarities}
        />
        {!hiddenSections?.has("types") && availableFilters.types.length > 0 && (
          <MultiSelectCombobox
            triggerStyle="button"
            label="Type"
            searchPlaceholder="Search types…"
            emptyText="No types match."
            options={availableFilters.types.map((value) => ({
              value,
              label: labels.cardTypes[value] ?? value,
            }))}
            selected={filterState.types}
            onChange={(next) => setArrayFilter("types", next)}
            icon={(value) => getFilterIconPath("types", value)}
            iconAfterLabel
            counts={filterCounts?.types}
          />
        )}
        {availableFilters.superTypes.length > 0 && !hiddenSections?.has("superTypes") && (
          <MultiSelectCombobox
            triggerStyle="button"
            label="Supertype"
            searchPlaceholder="Search supertypes…"
            emptyText="No supertypes match."
            options={availableFilters.superTypes.map((value) => ({
              value,
              label: labels.superTypes[value] ?? value,
            }))}
            selected={filterState.superTypes}
            onChange={(next) => setArrayFilter("superTypes", next)}
            icon={(value) => getFilterIconPath("superTypes", value)}
            iconAfterLabel
            counts={filterCounts?.superTypes}
          />
        )}
        {showVariantMenu &&
          (() => {
            // Art Variant is the primary section (and hosts the Signed flag);
            // Finish follows as a labeled group. When only one of the two
            // applies, the menu collapses to that single axis under its own
            // label with no headers.
            const artVariantOptions = availableFilters.artVariants.map((value) => ({
              value,
              label: labels.artVariants[value] ?? value,
            }));
            const finishOptions = availableFilters.finishes.map((value) => ({
              value,
              label: labels.finishes[value] ?? value,
            }));
            const both = showArtVariantSection && showFinishSection;
            const finishGroup = {
              label: "Finish",
              options: finishOptions,
              selected: filterState.finishes,
              onChange: (next: string[]) => setArrayFilter("finishes", next),
              counts: filterCounts?.finishes,
            };
            return (
              <MultiSelectCombobox
                triggerStyle="button"
                label={both ? "Variant" : showArtVariantSection ? "Art Variant" : "Finish"}
                searchPlaceholder={both ? "Search variants…" : "Search…"}
                emptyText={both ? "No variants match." : "No matches."}
                primaryLabel={both ? "Art Variant" : undefined}
                options={showArtVariantSection ? artVariantOptions : finishOptions}
                selected={showArtVariantSection ? filterState.artVariants : filterState.finishes}
                onChange={(next) =>
                  setArrayFilter(showArtVariantSection ? "artVariants" : "finishes", next)
                }
                counts={showArtVariantSection ? filterCounts?.artVariants : filterCounts?.finishes}
                groups={both ? [finishGroup] : undefined}
                flag={
                  signedInVariantMenu
                    ? {
                        label: "Signed",
                        state: filterState.signed,
                        count: filterCounts?.flags.signed,
                        onToggle: toggleSigned,
                      }
                    : undefined
                }
                // Grouped Variant dropdown is short; size it to its content and
                // only scroll when the viewport is tight, like a menu.
                fitContent
              />
            );
          })()}
        {showStats && (
          <FilterDropdownChip label="Stats" activeCount={statsActiveCount} contentClassName="w-80">
            {/* Each stat slider row (a direct child div) gets the same subtle
                hover the More menu's rows have. bg-accent resolves to the neutral
                muted set by the popover's NEUTRAL_HOVER_SCOPE. */}
            <div className="[&>div:focus-within]:bg-accent [&>div:hover]:bg-accent flex flex-col gap-0.5 [&>div]:rounded-md [&>div]:px-1.5 [&>div]:py-1.5">
              <FilterRangeSections
                scope="stats"
                availableFilters={availableFilters}
                filterCounts={filterCounts}
                hiddenSections={hiddenSections}
                // Keep the slider labels consistent with the "More" menu's
                // sliders (text-sm, full-strength, not the panel's muted
                // text-xs gutter).
                labelClassName="text-inherit text-sm font-normal"
              />
            </div>
          </FilterDropdownChip>
        )}
        {hasMore && (
          <FilterMoreMenu
            availableFilters={availableFilters}
            hiddenSections={hiddenSections}
            visibleCustomTagCategories={visibleCustomTagCategories}
            filterCounts={filterCounts}
            ownedCountMax={ownedCountMax}
            activeCount={moreActiveCount}
            hideSigned={signedInVariantMenu}
          />
        )}

        <FilterCustomizeControl className="text-muted-foreground ml-auto" />
      </div>
    </TooltipProvider>
  );
}

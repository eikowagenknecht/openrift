import type { ReactNode } from "react";
import { Fragment } from "react";

import { FilterSection } from "@/features/cards/components/filter-badge-row";
import { FlagBadge } from "@/features/cards/components/filter-flag-badge";
import type { FilterPanelContentProps } from "@/features/cards/components/filter-panel-content";
import { FilterValueDropdown } from "@/features/cards/components/filter-value-dropdown";
import { MultiSelectCombobox } from "@/features/cards/components/multi-select-combobox";
import { useFilterActions, useFilterValues } from "@/features/cards/hooks/use-card-filters";
import { useVisibleFilterDimensions } from "@/features/cards/hooks/use-filter-dimensions";
import { filterDimension, OWNED_BUCKETS } from "@/features/cards/lib/filter-dimensions";
import { nextOversize, oversizeCount, oversizeState } from "@/features/cards/lib/oversize-filter";
import {
  PRESENCE_LABELS,
  presenceFlagCount,
  presenceToFlagState,
} from "@/features/cards/lib/presence-filter";
import { groupTagsByCategory } from "@/features/collections/lib/tag-category-groups";
import { useCustomTagList, useTagCategories } from "@/hooks/use-enums";

export function FilterChipSections({
  availableFilters,
  hiddenSections,
  visibleCustomTagCategories,
  filterOverrides,
  filterCounts,
  units,
  variant = "rows",
}: Pick<
  FilterPanelContentProps,
  | "availableFilters"
  | "hiddenSections"
  | "visibleCustomTagCategories"
  | "filterOverrides"
  | "filterCounts"
> & {
  units?: ReadonlySet<string>;
  /** "rows" = labelled panel rows; "inline" = bare chips for the compact bar. */
  variant?: "rows" | "inline";
}) {
  const visibleDimensions = useVisibleFilterDimensions({
    availableFilters,
    hiddenSections,
    visibleCustomTagCategories,
  });
  const { filterState } = useFilterValues();
  const {
    setArrayFilter,
    cycleArrayFilter,
    toggleSigned,
    toggleOvernumbered,
    cyclePresence,
    toggleBanned,
    toggleErrata,
    toggleNoImage,
    toggleStandard,
  } = useFilterActions();
  const { byCategory: customTagsByCategory } = useCustomTagList();
  const visibleCategories = [...customTagsByCategory.entries()].filter(([category]) =>
    visibleCustomTagCategories === undefined ? true : visibleCustomTagCategories.has(category),
  );
  const { categories: tagCategories, categoryByTag } = useTagCategories();
  const tagGroups = groupTagsByCategory(availableFilters.tags, tagCategories, categoryByTag);
  const selected = (key: keyof typeof filterState) => {
    const urlValue = filterState[key];
    const arr = Array.isArray(urlValue) ? urlValue : [];
    return arr.length > 0 ? arr : (filterOverrides?.[key] ?? []);
  };
  const showUnit = (unit: string) => units === undefined || units.has(unit);
  const shows = (key: string) => visibleDimensions.has(key) && showUnit(filterDimension(key).unit);
  const triggerStyle = variant === "inline" ? "button" : "chip";
  const placeholder = variant === "rows" ? "Any" : undefined;

  const showMarkers = shows("markers");
  const showChannels = shows("channels");
  const showCustomTags = shows("customTags");
  const showTags = shows("tags");
  const showKeywords = shows("keywords");
  const showOwned = shows("owned");
  const showOversize = shows("cardSizes");
  const showSigned = shows("signed") && !shows("artVariants");
  const showOvernumbered = shows("overnumbered") && !shows("artVariants");
  const showBanned = shows("banned");
  const showErrata = shows("errata");
  const showNoImage = shows("noImage");
  const showStandard = shows("standard");
  const showFlags = showOvernumbered || showSigned || showBanned || showErrata || showNoImage;

  if (
    !showStandard &&
    !showMarkers &&
    !showOversize &&
    !showChannels &&
    !showCustomTags &&
    !showTags &&
    !showKeywords &&
    !showOwned &&
    !showFlags
  ) {
    return null;
  }

  const dropdownProps = { availableFilters, filterCounts, placeholder };

  const entries: { key: string; label: string; node: ReactNode }[] = [];
  if (showStandard) {
    entries.push({
      key: "standard",
      label: "Standard",
      node: (
        <FlagBadge
          label="Standard"
          state={filterState.standard}
          count={filterCounts?.flags.standard}
          onClick={toggleStandard}
          triggerStyle={triggerStyle}
        />
      ),
    });
  }
  if (showMarkers) {
    entries.push({
      key: "markers",
      label: "Markers",
      node: (
        <FilterValueDropdown dimension="markers" triggerStyle={triggerStyle} {...dropdownProps} />
      ),
    });
  }
  if (showOversize) {
    entries.push({
      key: "cardSizes",
      label: "Size",
      node: (
        <FlagBadge
          label="Oversized"
          state={oversizeState(filterState.cardSizes)}
          count={oversizeCount(filterCounts?.cardSizes, oversizeState(filterState.cardSizes))}
          onClick={() => setArrayFilter("cardSizes", nextOversize(filterState.cardSizes))}
          triggerStyle={triggerStyle}
        />
      ),
    });
  }
  if (showChannels) {
    entries.push({
      key: "channels",
      label: "Channels",
      node: (
        <FilterValueDropdown dimension="channels" triggerStyle={triggerStyle} {...dropdownProps} />
      ),
    });
  }
  if (showCustomTags) {
    entries.push({
      key: "customTags",
      label: "Custom Tags",
      node: (
        <>
          {visibleCategories.map(([category, tagsInCategory]) => {
            // All categories share the `customTags`/`customTagsEx` URL keys; slice per category before toggling.
            const allSelected = selected("customTags");
            const categorySlugs = new Set(tagsInCategory.map((t) => t.slug));
            const selectedInCategory = allSelected.filter((slug) => categorySlugs.has(slug));
            const excludedInCategory = filterState.customTagsEx.filter((slug) =>
              categorySlugs.has(slug),
            );
            const label = tagsInCategory[0]?.categoryLabel ?? category;
            const tagOptions = tagsInCategory.map((t) => ({ value: t.slug, label: t.label }));
            return (
              <MultiSelectCombobox
                key={category}
                label={label}
                searchPlaceholder={`Search ${label.toLowerCase()}…`}
                emptyText={`No ${label.toLowerCase()} match.`}
                options={tagOptions}
                selected={selectedInCategory}
                excluded={excludedInCategory}
                onCycle={(value) => cycleArrayFilter("customTags", "customTagsEx", value)}
                triggerStyle={triggerStyle}
              />
            );
          })}
          <FlagBadge
            label={PRESENCE_LABELS.customTags}
            state={presenceToFlagState(filterState.customTagsPresence)}
            count={presenceFlagCount(
              filterCounts?.presence.customTags,
              presenceToFlagState(filterState.customTagsPresence),
            )}
            onClick={() => cyclePresence("customTags")}
            triggerStyle={triggerStyle}
          />
        </>
      ),
    });
  }
  if (showTags) {
    entries.push({
      key: "tags",
      label: "Tags",
      node: (
        <>
          {tagGroups.map((group) => {
            const groupValues = new Set(group.tags);
            const selectedInGroup = selected("tags").filter((tag) => groupValues.has(tag));
            const excludedInGroup = filterState.tagsEx.filter((tag) => groupValues.has(tag));
            const tagOptions = group.tags.map((tag) => ({ value: tag, label: tag }));
            return (
              <MultiSelectCombobox
                key={group.slug}
                label={group.label}
                searchPlaceholder={`Search ${group.label.toLowerCase()}…`}
                emptyText={`No ${group.label.toLowerCase()} match.`}
                options={tagOptions}
                selected={selectedInGroup}
                excluded={excludedInGroup}
                onCycle={(value) => cycleArrayFilter("tags", "tagsEx", value)}
                counts={filterCounts?.tags}
                triggerStyle={triggerStyle}
              />
            );
          })}
          <FlagBadge
            label={PRESENCE_LABELS.tags}
            state={presenceToFlagState(filterState.tagsPresence)}
            count={presenceFlagCount(
              filterCounts?.presence.tags,
              presenceToFlagState(filterState.tagsPresence),
            )}
            onClick={() => cyclePresence("tags")}
            triggerStyle={triggerStyle}
          />
        </>
      ),
    });
  }
  if (showKeywords) {
    entries.push({
      key: "keywords",
      label: "Keywords",
      node: (
        <FilterValueDropdown dimension="keywords" triggerStyle={triggerStyle} {...dropdownProps} />
      ),
    });
  }
  if (showFlags) {
    entries.push({
      key: "flags",
      label: "Flags",
      node: (
        <>
          {showOvernumbered && (
            <FlagBadge
              label="Overnumbered"
              state={filterState.overnumbered}
              count={filterCounts?.flags.overnumbered}
              onClick={toggleOvernumbered}
              triggerStyle={triggerStyle}
            />
          )}
          {showSigned && (
            <FlagBadge
              label="Signed"
              state={filterState.signed}
              count={filterCounts?.flags.signed}
              onClick={toggleSigned}
              triggerStyle={triggerStyle}
            />
          )}
          {showBanned && (
            <FlagBadge
              label="Banned"
              state={filterState.banned}
              count={filterCounts?.flags.banned}
              onClick={toggleBanned}
              triggerStyle={triggerStyle}
            />
          )}
          {showErrata && (
            <FlagBadge
              label="Errata"
              state={filterState.errata}
              count={filterCounts?.flags.errata}
              onClick={toggleErrata}
              triggerStyle={triggerStyle}
            />
          )}
          {showNoImage && (
            <FlagBadge
              label="No image yet"
              state={filterState.noImage}
              count={filterCounts?.flags.noImage}
              onClick={toggleNoImage}
              triggerStyle={triggerStyle}
            />
          )}
        </>
      ),
    });
  }
  if (showOwned) {
    entries.push({
      key: "owned",
      label: "Owned",
      node: (
        <MultiSelectCombobox
          label="Owned"
          placeholder={placeholder}
          searchPlaceholder="Search owned…"
          emptyText="No options match."
          options={OWNED_BUCKETS.map((bucket) => ({
            value: bucket.value,
            label: bucket.label,
          }))}
          selected={filterState.owned}
          onChange={(values) => setArrayFilter("owned", values)}
          triggerStyle={triggerStyle}
        />
      ),
    });
  }

  if (variant === "inline") {
    return (
      <>
        {entries.map((entry) => (
          <Fragment key={entry.key}>{entry.node}</Fragment>
        ))}
      </>
    );
  }
  return (
    <>
      {entries.map((entry) => (
        <FilterSection key={entry.key} label={entry.label}>
          {entry.node}
        </FilterSection>
      ))}
    </>
  );
}

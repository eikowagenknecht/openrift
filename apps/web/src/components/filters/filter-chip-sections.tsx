import type { ReactNode } from "react";
import { Fragment } from "react";

import { FilterSection } from "@/components/filters/filter-badge-row";
import { FlagBadge } from "@/components/filters/filter-flag-badge";
import type { FilterPanelContentProps } from "@/components/filters/filter-panel-content";
import { FilterValueDropdown } from "@/components/filters/filter-value-dropdown";
import { MultiSelectCombobox } from "@/components/filters/multi-select-combobox";
import { useFilterActions, useFilterValues } from "@/hooks/use-card-filters";
import { useCustomTagList, useTagCategories } from "@/hooks/use-enums";
import { useVisibleFilterDimensions } from "@/hooks/use-filter-dimensions";
import { filterDimension, OWNED_BUCKETS } from "@/lib/filter-dimensions";
import { nextOversize, oversizeCount, oversizeState } from "@/lib/oversize-filter";
import { PRESENCE_LABELS, presenceFlagCount, presenceToFlagState } from "@/lib/presence-filter";
import { groupTagsByCategory } from "@/lib/tag-category-groups";

/**
 * The chip-styled filter units: the markers / distribution-channels /
 * custom-tag / keyword / owned comboboxes (each folding in its any/none
 * presence where it has one) plus the flag chips (Oversized, Signed, Banned,
 * Errata, Standard). Self-contained (sources its own enum/tag data) so the
 * vertical panels and the compact filter bar render identical controls.
 *
 * `units` picks which placement units render here: the panel body passes the
 * promoted set, the More fold passes the demoted set, and the compact bar
 * passes its promoted set with `variant="inline"`. The Signed flag belongs to
 * the Variant unit — it rides the Art Variant badge section when that renders
 * in the same host, and falls back to a flag chip here otherwise.
 * @returns The chip sections, or null when nothing applies.
 */
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
  /**
   * Placement units to render here (see `lib/filter-sections.ts`). Omit to
   * render every chip unit (collection stats page).
   */
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
    toggleStandard,
  } = useFilterActions();
  // Custom tags come from /init (admin-curated, not derived from the printing
  // set), so they're sourced directly here rather than threaded through
  // AvailableFilters like markers/channels.
  const { byCategory: customTagsByCategory } = useCustomTagList();
  const visibleCategories = [...customTagsByCategory.entries()].filter(([category]) =>
    visibleCustomTagCategories === undefined ? true : visibleCustomTagCategories.has(category),
  );
  // Printed tags come from the printing set (AvailableFilters, like keywords);
  // only their grouping into category sections comes from /init.
  const { categories: tagCategories, categoryByTag } = useTagCategories();
  const tagGroups = groupTagsByCategory(availableFilters.tags, tagCategories, categoryByTag);
  // Use overrides when URL state is empty (zone presets that aren't in the URL).
  const selected = (key: keyof typeof filterState) => {
    const urlValue = filterState[key];
    const arr = Array.isArray(urlValue) ? urlValue : [];
    return arr.length > 0 ? arr : (filterOverrides?.[key] ?? []);
  };
  const showUnit = (unit: string) => units === undefined || units.has(unit);
  // One predicate per dimension, from the registry: the axis has content the
  // surface hasn't hidden, and its placement unit belongs to this host.
  const shows = (key: string) => visibleDimensions.has(key) && showUnit(filterDimension(key).unit);
  const triggerStyle = variant === "inline" ? "button" : "chip";
  // In labelled rows the row gutter already names the dimension, so a lone
  // combobox reads as a value control; inline chips must self-label. The
  // custom-tag comboboxes always self-label (several share one row).
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
  const showStandard = shows("standard");
  const showFlags = showOvernumbered || showSigned || showBanned || showErrata;

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

  // Markers, Distribution Channels and Keywords render through the shared
  // dimension dropdown, so these chips and the compact bar's More rows come
  // from one definition per axis.
  const dropdownProps = { availableFilters, filterCounts, placeholder };

  const entries: { key: string; label: string; node: ReactNode }[] = [];
  if (showStandard) {
    // Standard sits right after Variant in the canonical order (a promo
    // printing is a printing property, like a variant), so it leads the chip
    // entries — in the panel that lands it directly under the Variant badges.
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
    // Two physical sizes exist, so Size is a single Oversized tri-state
    // (require oversized / require standard / off) rather than a value list.
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
            // Each category gets its own dropdown, but they all write to the same
            // `customTags` URL key — so when toggling within one category we merge
            // with whatever the other categories already hold. `selected("customTags")`
            // is the union (URL or override fallback); we slice it down to this
            // category's slugs for the dropdown's `selected` prop.
            const allSelected = selected("customTags");
            const categorySlugs = new Set(tagsInCategory.map((t) => t.slug));
            const selectedInCategory = allSelected.filter((slug) => categorySlugs.has(slug));
            // Exclude companion, sliced the same way: each category's dropdown shows
            // only its own slugs from the shared `customTagsEx` key. The cycle acts
            // on the full arrays by value, so other categories stay untouched.
            const excludedInCategory = filterState.customTagsEx.filter((slug) =>
              categorySlugs.has(slug),
            );
            // `byCategory` is grouped from non-empty arrays, so the first tag
            // always exists and carries the joined category label from /init. The
            // `?? category` is a defensive fallback only.
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
          {/* Custom tags render as one combobox per category, so their card-level
              any/none presence can't fold into a single picker — it rides as a
              standalone chip beside them. */}
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
            // Same pattern as custom tags: one dropdown per category, all
            // writing to the shared `tags`/`tagsEx` URL keys, each showing
            // only its own values. Values are the exact printed strings.
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
          {/* Like custom tags, the per-category dropdowns can't host a single
              card-level any/none picker — it rides as a standalone chip. */}
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

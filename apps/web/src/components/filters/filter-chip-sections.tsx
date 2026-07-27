import type { ReactNode } from "react";
import { Fragment } from "react";

import { FilterSection } from "@/components/filters/filter-badge-row";
import { FlagBadge } from "@/components/filters/filter-flag-badge";
import type { FilterPanelContentProps } from "@/components/filters/filter-panel-content";
import { MultiSelectCombobox } from "@/components/filters/multi-select-combobox";
import { useFilterActions, useFilterValues } from "@/hooks/use-card-filters";
import { useCustomTagList, useTagCategories } from "@/hooks/use-enums";
import { buildChannelBreadcrumbs } from "@/lib/channel-breadcrumbs";
import { nextOversize, oversizeCount, oversizeState } from "@/lib/oversize-filter";
import { PRESENCE_LABELS, presenceFlagCount, presenceToFlagState } from "@/lib/presence-filter";
import type { OwnedBucket } from "@/lib/search-schemas";
import { groupTagsByCategory } from "@/lib/tag-category-groups";

export const OWNED_BUCKETS: readonly { value: OwnedBucket; label: string }[] = [
  { value: "none", label: "None" },
  { value: "partial", label: "Partial Playset" },
  { value: "full", label: "Full Playset" },
  { value: "extra", label: "More than Full" },
];

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
  const { filterState } = useFilterValues();
  const {
    setArrayFilter,
    cycleArrayFilter,
    toggleSigned,
    cyclePresence,
    toggleBanned,
    toggleErrata,
    toggleStandard,
  } = useFilterActions();
  // Pre-build channel breadcrumbs once so the section can render full paths
  // (e.g. "Tournament › Regionals › Top 8") and the cmdk filter can search them.
  const channelBreadcrumbs = buildChannelBreadcrumbs(availableFilters.distributionChannels);
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
  const triggerStyle = variant === "inline" ? "button" : "chip";
  // In labelled rows the row gutter already names the dimension, so a lone
  // combobox reads as a value control; inline chips must self-label. The
  // custom-tag comboboxes always self-label (several share one row).
  const placeholder = variant === "rows" ? "Any" : undefined;

  const showMarkers =
    showUnit("markers") && !hiddenSections?.has("markers") && availableFilters.markers.length > 0;
  const showChannels =
    showUnit("channels") &&
    !hiddenSections?.has("channels") &&
    availableFilters.distributionChannels.length > 0;
  const showCustomTags =
    showUnit("customTags") && !hiddenSections?.has("customTags") && visibleCategories.length > 0;
  const showTags = showUnit("tags") && !hiddenSections?.has("tags") && tagGroups.length > 0;
  const showKeywords =
    showUnit("keywords") &&
    !hiddenSections?.has("keywords") &&
    availableFilters.keywords.length > 0;
  const showOwned = showUnit("owned") && !hiddenSections?.has("owned");
  const showOversize =
    showUnit("cardSizes") &&
    !hiddenSections?.has("cardSizes") &&
    availableFilters.cardSizes.length > 1;
  // Signed belongs to the Variant unit; it only renders here when the Art
  // Variant badge section (its preferred host) isn't shown in the same host.
  const signedApplicable = availableFilters.hasSigned && !hiddenSections?.has("signed");
  const artVariantShownHere =
    showUnit("variant") &&
    availableFilters.artVariants.length > 1 &&
    !hiddenSections?.has("artVariants");
  const showSigned = showUnit("variant") && signedApplicable && !artVariantShownHere;
  const showBanned =
    showUnit("banned") && availableFilters.hasBanned && !hiddenSections?.has("banned");
  const showErrata =
    showUnit("errata") && availableFilters.hasErrata && !hiddenSections?.has("errata");
  const showStandard =
    showUnit("standard") && availableFilters.hasNonStandard && !hiddenSections?.has("standard");
  const showFlags = showSigned || showBanned || showErrata;

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

  // Shared between the Include primary list and the Exclude group so both halves
  // of each dropdown offer the same options (ADR-034).
  const markerOptions = availableFilters.markers.map((m) => ({ value: m.slug, label: m.label }));
  const channelOptions = availableFilters.distributionChannels.map((c) => ({
    value: c.slug,
    label: channelBreadcrumbs.get(c.id) ?? c.label,
  }));
  const keywordOptions = availableFilters.keywords.map((keyword) => ({
    value: keyword,
    label: keyword,
  }));

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
        <MultiSelectCombobox
          label="Markers"
          placeholder={placeholder}
          searchPlaceholder="Search markers…"
          emptyText="No markers match."
          options={markerOptions}
          selected={filterState.markers}
          excluded={filterState.markersEx}
          onCycle={(value) => cycleArrayFilter("markers", "markersEx", value)}
          counts={filterCounts?.markers}
          triggerStyle={triggerStyle}
          flagPosition="top"
          flag={{
            label: PRESENCE_LABELS.markers,
            state: presenceToFlagState(filterState.markersPresence),
            count: presenceFlagCount(
              filterCounts?.presence.markers,
              presenceToFlagState(filterState.markersPresence),
            ),
            onToggle: () => cyclePresence("markers"),
          }}
        />
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
        <MultiSelectCombobox
          label="Distribution Channels"
          placeholder={placeholder}
          searchPlaceholder="Search distribution channels…"
          emptyText="No distribution channels match."
          options={channelOptions}
          selected={filterState.channels}
          excluded={filterState.channelsEx}
          onCycle={(value) => cycleArrayFilter("channels", "channelsEx", value)}
          counts={filterCounts?.channels}
          triggerStyle={triggerStyle}
          flagPosition="top"
          flag={{
            label: PRESENCE_LABELS.distributionChannels,
            state: presenceToFlagState(filterState.channelsPresence),
            count: presenceFlagCount(
              filterCounts?.presence.distributionChannels,
              presenceToFlagState(filterState.channelsPresence),
            ),
            onToggle: () => cyclePresence("distributionChannels"),
          }}
        />
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
        <MultiSelectCombobox
          label="Keywords"
          placeholder={placeholder}
          searchPlaceholder="Search keywords…"
          emptyText="No keywords match."
          options={keywordOptions}
          selected={filterState.keywords}
          excluded={filterState.keywordsEx}
          onCycle={(value) => cycleArrayFilter("keywords", "keywordsEx", value)}
          counts={filterCounts?.keywords}
          triggerStyle={triggerStyle}
          flagPosition="top"
          flag={{
            label: PRESENCE_LABELS.keywords,
            state: presenceToFlagState(filterState.keywordsPresence),
            count: presenceFlagCount(
              filterCounts?.presence.keywords,
              presenceToFlagState(filterState.keywordsPresence),
            ),
            onToggle: () => cyclePresence("keywords"),
          }}
        />
      ),
    });
  }
  if (showFlags) {
    entries.push({
      key: "flags",
      label: "Flags",
      node: (
        <>
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

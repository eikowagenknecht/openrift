import type { AvailableFilters, FilterCounts, PresenceDimension } from "@openrift/shared";
import { CheckIcon, ChevronDownIcon, MinusIcon } from "lucide-react";
import { Fragment } from "react";

import { FilterRangeSections, OWNED_BUCKETS } from "@/components/filters/filter-panel-content";
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
import { useCustomTagList, useEnumOrders, useLanguageLabels } from "@/hooks/use-enums";
import { buildChannelBreadcrumbs } from "@/lib/channel-breadcrumbs";
import { formatDomainFilterLabel } from "@/lib/domain";
import { getFilterIconPath } from "@/lib/icons";
import { nextOversize, oversizeCount, oversizeState } from "@/lib/oversize-filter";
import type { PresenceParamValue } from "@/lib/presence-filter";
import { PRESENCE_LABELS, presenceFlagCount, presenceToFlagState } from "@/lib/presence-filter";
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
  const { labels } = useEnumOrders();
  const languageLabels = useLanguageLabels();
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
  const channelBreadcrumbs = buildChannelBreadcrumbs(availableFilters.distributionChannels);
  const { byCategory: customTagsByCategory } = useCustomTagList();
  const visibleCategories = [...customTagsByCategory.entries()].filter(([category]) =>
    visibleCustomTagCategories === undefined ? true : visibleCustomTagCategories.has(category),
  );

  const isMore = (unit: string) => !topLevelUnits.has(unit);

  // ── Core card dimensions (only when demoted) ──────────────────────────────
  const showLanguages =
    isMore("languages") &&
    !hiddenSections?.has("languages") &&
    (availableLanguages?.length ?? 0) > 1;
  const showSets =
    isMore("sets") && !hiddenSections?.has("sets") && availableFilters.sets.length > 0;
  const showDomains =
    isMore("domains") && !hiddenSections?.has("domains") && availableFilters.domains.length > 0;
  const showRarities =
    isMore("rarities") && !hiddenSections?.has("rarities") && availableFilters.rarities.length > 0;
  const showTypes =
    isMore("types") && !hiddenSections?.has("types") && availableFilters.types.length > 0;
  const showSuperTypes =
    isMore("superTypes") &&
    !hiddenSections?.has("superTypes") &&
    availableFilters.superTypes.length > 0;
  const showArtVariantSection =
    !hiddenSections?.has("artVariants") && availableFilters.artVariants.length > 1;
  const showFinishSection =
    !hiddenSections?.has("finishes") && availableFilters.finishes.length > 1;
  const showVariantRow = isMore("variant") && (showArtVariantSection || showFinishSection);
  const signedApplicable = availableFilters.hasSigned && !hiddenSections?.has("signed");
  // Signed belongs to the Variant unit: it rides the Variant row's flag when
  // the Art Variant axis renders here, and falls back to its own flag row when
  // the unit is demoted without that axis (mirroring FilterChipSections).
  const signedInVariantRow = showVariantRow && signedApplicable && showArtVariantSection;
  const showSignedRow = isMore("variant") && signedApplicable && !signedInVariantRow;
  const showStats =
    isMore("stats") &&
    (!hiddenSections?.has("energy") ||
      !hiddenSections?.has("might") ||
      !hiddenSections?.has("power"));

  // ── Chip dimensions (only when demoted) ───────────────────────────────────
  const showPrice =
    isMore("price") && !hiddenSections?.has("price") && availableFilters.price.max > 0;
  const showOwned = isMore("owned") && !hiddenSections?.has("owned");
  const showCopies = showOwned && ownedCountMax !== undefined && ownedCountMax > 0;
  const showBanned =
    isMore("banned") && availableFilters.hasBanned && !hiddenSections?.has("banned");
  const showErrata =
    isMore("errata") && availableFilters.hasErrata && !hiddenSections?.has("errata");
  const showStandard =
    isMore("standard") && availableFilters.hasNonStandard && !hiddenSections?.has("standard");
  const showMarkers =
    isMore("markers") && !hiddenSections?.has("markers") && availableFilters.markers.length > 0;
  const showChannels =
    isMore("channels") &&
    !hiddenSections?.has("channels") &&
    availableFilters.distributionChannels.length > 0;
  const showCustomTags =
    isMore("customTags") && !hiddenSections?.has("customTags") && visibleCategories.length > 0;
  const showKeywords =
    isMore("keywords") && !hiddenSections?.has("keywords") && availableFilters.keywords.length > 0;
  const showCardSizes =
    isMore("cardSizes") &&
    !hiddenSections?.has("cardSizes") &&
    availableFilters.cardSizes.length > 1;

  // A dimension's any/none presence folds into the top of its combobox (Markers,
  // Distribution Channels, Keywords), matching the expanded panel. Custom tags
  // (many category pickers) have no single picker to fold into, so they ride as
  // their own tri-state row.
  const presenceFlag = (dimension: PresenceDimension, value: PresenceParamValue) => {
    const state = presenceToFlagState(value);
    return {
      label: PRESENCE_LABELS[dimension],
      state,
      count: presenceFlagCount(filterCounts?.presence[dimension], state),
      onToggle: () => cyclePresence(dimension),
    };
  };
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

  // ── Core dimension rows ────────────────────────────────────────────────────
  const languagesNode = showLanguages ? (
    <MultiSelectCombobox
      key="languages"
      triggerStyle="menu"
      label="Language"
      searchPlaceholder="Search languages…"
      emptyText="No languages match."
      options={(availableLanguages ?? []).map((value) => ({
        value,
        label: languageLabels[value] ?? value,
      }))}
      selected={filterState.languages}
      excluded={filterState.languagesEx}
      onCycle={(value) => cycleArrayFilter("languages", "languagesEx", value)}
      counts={filterCounts?.languages}
    />
  ) : null;
  const setsNode = showSets ? (
    <MultiSelectCombobox
      key="sets"
      triggerStyle="menu"
      label="Sets"
      searchPlaceholder="Search sets…"
      emptyText="No sets match."
      options={availableFilters.sets.map((value) => {
        const name = setDisplayLabel?.(value) ?? value;
        return name === value ? { value, label: value } : { value, label: name, prefix: value };
      })}
      selected={filterState.sets}
      excluded={filterState.setsEx}
      onCycle={(value) => cycleArrayFilter("sets", "setsEx", value)}
      counts={filterCounts?.sets}
      mutedOptions={availableFilters.supplementalSets}
    />
  ) : null;
  const domainsNode = showDomains ? (
    <MultiSelectCombobox
      key="domains"
      triggerStyle="menu"
      label="Domain"
      searchPlaceholder="Search domains…"
      emptyText="No domains match."
      options={availableFilters.domains.map((value) => ({
        value,
        label: formatDomainFilterLabel(value, labels.domains),
      }))}
      selected={filterState.domains}
      excluded={filterState.domainsEx}
      onCycle={(value) => cycleArrayFilter("domains", "domainsEx", value)}
      icon={(value) => getFilterIconPath("domains", value)}
      counts={filterCounts?.domains}
    />
  ) : null;
  const raritiesNode = showRarities ? (
    <MultiSelectCombobox
      key="rarities"
      triggerStyle="menu"
      label="Rarity"
      searchPlaceholder="Search rarities…"
      emptyText="No rarities match."
      options={availableFilters.rarities.map((value) => ({
        value,
        label: labels.rarities[value] ?? value,
      }))}
      selected={filterState.rarities}
      excluded={filterState.raritiesEx}
      onCycle={(value) => cycleArrayFilter("rarities", "raritiesEx", value)}
      icon={(value) => getFilterIconPath("rarities", value)}
      counts={filterCounts?.rarities}
    />
  ) : null;
  const typesNode = showTypes ? (
    <MultiSelectCombobox
      key="types"
      triggerStyle="menu"
      label="Type"
      searchPlaceholder="Search types…"
      emptyText="No types match."
      options={availableFilters.types.map((value) => ({
        value,
        label: labels.cardTypes[value] ?? value,
      }))}
      selected={filterState.types}
      excluded={filterState.typesEx}
      onCycle={(value) => cycleArrayFilter("types", "typesEx", value)}
      icon={(value) => getFilterIconPath("types", value)}
      iconAfterLabel
      counts={filterCounts?.types}
    />
  ) : null;
  const superTypesNode = showSuperTypes ? (
    <MultiSelectCombobox
      key="superTypes"
      triggerStyle="menu"
      label="Supertype"
      searchPlaceholder="Search supertypes…"
      emptyText="No supertypes match."
      options={availableFilters.superTypes.map((value) => ({
        value,
        label: labels.superTypes[value] ?? value,
      }))}
      selected={filterState.superTypes}
      excluded={filterState.superTypesEx}
      onCycle={(value) => cycleArrayFilter("superTypes", "superTypesEx", value)}
      icon={(value) => getFilterIconPath("superTypes", value)}
      iconAfterLabel
      counts={filterCounts?.superTypes}
    />
  ) : null;
  const variantNode = showVariantRow
    ? (() => {
        // Art Variant is the primary axis (and hosts the Signed flag); Finish
        // follows as a labeled axis. Each axis's rows cycle off → include →
        // exclude → off (ADR-034). When only one of the two applies, the row
        // collapses to that single axis. Mirrors the compact bar's Variant chip.
        const artVariantOptions = availableFilters.artVariants.map((value) => ({
          value,
          label: labels.artVariants[value] ?? value,
        }));
        const finishOptions = availableFilters.finishes.map((value) => ({
          value,
          label: labels.finishes[value] ?? value,
        }));
        const both = showArtVariantSection && showFinishSection;
        const primaryIsArt = showArtVariantSection;
        const groups = both
          ? [
              {
                label: "Finish",
                options: finishOptions,
                included: filterState.finishes,
                excluded: filterState.finishesEx,
                onCycle: (value: string) => cycleArrayFilter("finishes", "finishesEx", value),
                counts: filterCounts?.finishes,
              },
            ]
          : [];
        return (
          <MultiSelectCombobox
            key="variant"
            triggerStyle="menu"
            label={both ? "Variant" : showArtVariantSection ? "Art Variant" : "Finish"}
            searchPlaceholder={both ? "Search variants…" : "Search…"}
            emptyText={both ? "No variants match." : "No matches."}
            primaryLabel={both ? "Art Variant" : undefined}
            options={primaryIsArt ? artVariantOptions : finishOptions}
            selected={primaryIsArt ? filterState.artVariants : filterState.finishes}
            excluded={primaryIsArt ? filterState.artVariantsEx : filterState.finishesEx}
            onCycle={(value) =>
              primaryIsArt
                ? cycleArrayFilter("artVariants", "artVariantsEx", value)
                : cycleArrayFilter("finishes", "finishesEx", value)
            }
            counts={primaryIsArt ? filterCounts?.artVariants : filterCounts?.finishes}
            groups={groups}
            flag={
              signedInVariantRow
                ? {
                    label: "Signed",
                    state: filterState.signed,
                    count: filterCounts?.flags.signed,
                    onToggle: toggleSigned,
                  }
                : undefined
            }
          />
        );
      })()
    : null;
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
  const showOversizeNode = showCardSizes;
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
  const bannedNode = showBanned ? (
    <FlagMenuItem
      key="banned"
      label="Banned"
      state={filterState.banned}
      count={filterCounts?.flags.banned}
      onToggle={toggleBanned}
    />
  ) : null;
  const errataNode = showErrata ? (
    <FlagMenuItem
      key="errata"
      label="Errata"
      state={filterState.errata}
      count={filterCounts?.flags.errata}
      onToggle={toggleErrata}
    />
  ) : null;
  const standardNode = showStandard ? (
    <FlagMenuItem
      key="standard"
      label="Standard"
      state={filterState.standard}
      count={filterCounts?.flags.standard}
      onToggle={toggleStandard}
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
      included={filterState.markers}
      excluded={filterState.markersEx}
      onCycle={(value) => cycleArrayFilter("markers", "markersEx", value)}
      searchPlaceholder="Search markers…"
      emptyText="No markers match."
      flag={presenceFlag("markers", filterState.markersPresence)}
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
      included={filterState.channels}
      excluded={filterState.channelsEx}
      onCycle={(value) => cycleArrayFilter("channels", "channelsEx", value)}
      searchPlaceholder="Search distribution channels…"
      emptyText="No distribution channels match."
      flag={presenceFlag("distributionChannels", filterState.channelsPresence)}
    />
  ) : null;
  const keywordsNode = showKeywords ? (
    <MoreDimension
      key="keywords"
      label="Keywords"
      options={availableFilters.keywords.map((keyword) => ({
        value: keyword,
        label: keyword,
        count: filterCounts?.keywords.get(keyword),
      }))}
      included={filterState.keywords}
      excluded={filterState.keywordsEx}
      onCycle={(value) => cycleArrayFilter("keywords", "keywordsEx", value)}
      searchPlaceholder="Search keywords…"
      emptyText="No keywords match."
      flag={presenceFlag("keywords", filterState.keywordsPresence)}
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
        languagesNode,
        setsNode,
        domainsNode,
        raritiesNode,
        typesNode,
        superTypesNode,
        variantNode,
        standardNode,
        statsNode,
      ],
    },
    {
      id: "dimensions",
      items: [
        markersNode,
        oversizeNode,
        channelsNode,
        ...customTagNodes,
        customTagsPresenceNode,
        keywordsNode,
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
  // When exactly one More entry is active, the trigger reflects that entry by
  // name — like the value dropdowns do (Type → "Unit") — instead of a bare
  // "More (1)". Ranges have no single value, so they surface their dimension
  // name. Every entry is gated by its unit being demoted here, so the list
  // lines up with the parent's placement-aware `activeCount`.
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
    const pushValues = (
      shown: boolean,
      included: string[],
      excluded: string[],
      labelFor: (slug: string) => string,
    ) => {
      if (!shown) {
        return;
      }
      for (const slug of included) {
        entries.push(labelFor(slug));
      }
      for (const slug of excluded) {
        entries.push(`−${labelFor(slug)}`);
      }
    };
    // Demoted core dimensions first, mirroring the block order above.
    pushValues(
      isMore("languages"),
      filterState.languages,
      filterState.languagesEx,
      (slug) => languageLabels[slug] ?? slug,
    );
    pushValues(
      isMore("sets"),
      filterState.sets,
      filterState.setsEx,
      (slug) => setDisplayLabel?.(slug) ?? slug,
    );
    pushValues(isMore("domains"), filterState.domains, filterState.domainsEx, (slug) =>
      formatDomainFilterLabel(slug, labels.domains),
    );
    pushValues(
      isMore("rarities"),
      filterState.rarities,
      filterState.raritiesEx,
      (slug) => labels.rarities[slug] ?? slug,
    );
    pushValues(
      isMore("types"),
      filterState.types,
      filterState.typesEx,
      (slug) => labels.cardTypes[slug] ?? slug,
    );
    pushValues(
      isMore("superTypes"),
      filterState.superTypes,
      filterState.superTypesEx,
      (slug) => labels.superTypes[slug] ?? slug,
    );
    pushValues(
      isMore("variant"),
      filterState.artVariants,
      filterState.artVariantsEx,
      (slug) => labels.artVariants[slug] ?? slug,
    );
    pushValues(
      isMore("variant"),
      filterState.finishes,
      filterState.finishesEx,
      (slug) => labels.finishes[slug] ?? slug,
    );
    if (isMore("stats")) {
      const statEntries: [string, number | null, number | null][] = [
        ["Energy", filterState.energyMin, filterState.energyMax],
        ["Might", filterState.mightMin, filterState.mightMax],
        ["Power", filterState.powerMin, filterState.powerMax],
      ];
      for (const [statLabel, min, max] of statEntries) {
        if (min !== null || max !== null) {
          entries.push(statLabel);
        }
      }
    }
    // Trait name for "any", minus-prefixed for "none" ("−Has any marker"),
    // matching the include/exclude language the badges and chips use.
    const presenceEntries: [PresenceDimension, PresenceParamValue, boolean][] = [
      ["markers", filterState.markersPresence, isMore("markers")],
      ["superTypes", filterState.superTypesPresence, isMore("superTypes")],
      ["customTags", filterState.customTagsPresence, isMore("customTags")],
      ["distributionChannels", filterState.channelsPresence, isMore("channels")],
      ["keywords", filterState.keywordsPresence, isMore("keywords")],
    ];
    for (const [dimension, value, shown] of presenceEntries) {
      if (shown && value !== null) {
        entries.push(
          value === "none" ? `−${PRESENCE_LABELS[dimension]}` : PRESENCE_LABELS[dimension],
        );
      }
    }
    if (isMore("variant") && filterState.signed !== null) {
      entries.push(filterState.signed === false ? "−Signed" : "Signed");
    }
    if (isMore("banned") && filterState.banned !== null) {
      entries.push(filterState.banned === false ? "−Banned" : "Banned");
    }
    if (isMore("errata") && filterState.errata !== null) {
      entries.push(filterState.errata === false ? "−Errata" : "Errata");
    }
    if (isMore("standard") && (filterState.standard === true || filterState.standard === false)) {
      entries.push(filterState.standard === false ? "−Standard" : "Standard");
    }
    if (isMore("cardSizes") && oversizeState_ !== null) {
      entries.push(oversizeState_ ? "Oversized" : "−Oversized");
    }
    pushValues(
      isMore("markers"),
      filterState.markers,
      filterState.markersEx,
      (slug) => markerLabels.get(slug) ?? slug,
    );
    pushValues(
      isMore("channels"),
      filterState.channels,
      filterState.channelsEx,
      (slug) => channelLabels.get(slug) ?? slug,
    );
    // Keyword filter values are their own names, so no label lookup is needed.
    pushValues(
      isMore("keywords"),
      filterState.keywords,
      filterState.keywordsEx,
      (keyword) => keyword,
    );
    pushValues(
      isMore("customTags"),
      filterState.customTags,
      filterState.customTagsEx,
      (slug) => tagLabels.get(slug) ?? slug,
    );
    if (isMore("owned")) {
      for (const value of filterState.owned) {
        entries.push(ownedLabels.get(value) ?? value);
      }
      if (filterState.ownedCountMin !== null || filterState.ownedCountMax !== null) {
        entries.push("Copies");
      }
    }
    if (isMore("price") && (filterState.priceMin !== null || filterState.priceMax !== null)) {
      entries.push("Price");
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

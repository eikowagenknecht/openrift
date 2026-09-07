import type { AvailableFilters, FilterCounts, PresenceDimension } from "@openrift/shared";

import type { MultiSelectComboboxProps } from "@/components/filters/multi-select-combobox";
import { MultiSelectCombobox } from "@/components/filters/multi-select-combobox";
import { useFilterActions, useFilterValues } from "@/hooks/use-card-filters";
import { useEnumOrders, useLanguageLabels } from "@/hooks/use-enums";
import { buildChannelBreadcrumbs } from "@/lib/channel-breadcrumbs";
import { formatDomainFilterLabel } from "@/lib/domain";
import { getFilterIconPath } from "@/lib/icons";
import { PRESENCE_LABELS, presenceFlagCount, presenceToFlagState } from "@/lib/presence-filter";

interface DropdownContext {
  availableFilters: AvailableFilters;
  availableLanguages?: string[];
  setDisplayLabel?: (code: string) => string;
  filterCounts?: FilterCounts;
  filterState: ReturnType<typeof useFilterValues>["filterState"];
  actions: ReturnType<typeof useFilterActions>;
  labels: ReturnType<typeof useEnumOrders>["labels"];
  languageLabels: Record<string, string>;
  channelBreadcrumbs: ReadonlyMap<string, string>;
}

type DropdownSpec = Omit<MultiSelectComboboxProps, "triggerStyle" | "placeholder" | "fitContent">;

// Presence toggle folded into the top of a dimension's picker, matching the expanded panel.
function presenceFlag(
  dimension: PresenceDimension,
  value: "any" | "none" | null,
  ctx: DropdownContext,
): NonNullable<MultiSelectComboboxProps["flags"]>[number] {
  const state = presenceToFlagState(value);
  return {
    label: PRESENCE_LABELS[dimension],
    state,
    count: presenceFlagCount(ctx.filterCounts?.presence[dimension], state),
    onToggle: () => ctx.actions.cyclePresence(dimension),
  };
}

const DROPDOWNS: Record<string, (ctx: DropdownContext) => DropdownSpec> = {
  languages: (ctx) => ({
    label: "Language",
    searchPlaceholder: "Search languages…",
    emptyText: "No languages match.",
    options: (ctx.availableLanguages ?? []).map((value) => ({
      value,
      label: ctx.languageLabels[value] ?? value,
    })),
    selected: ctx.filterState.languages,
    excluded: ctx.filterState.languagesEx,
    onCycle: (value) => ctx.actions.cycleArrayFilter("languages", "languagesEx", value),
    counts: ctx.filterCounts?.languages,
  }),
  sets: (ctx) => ({
    label: "Sets",
    searchPlaceholder: "Search sets…",
    emptyText: "No sets match.",
    options: ctx.availableFilters.sets.map((value) => {
      const name = ctx.setDisplayLabel?.(value) ?? value;
      return name === value ? { value, label: value } : { value, label: name, prefix: value };
    }),
    selected: ctx.filterState.sets,
    excluded: ctx.filterState.setsEx,
    onCycle: (value) => ctx.actions.cycleArrayFilter("sets", "setsEx", value),
    counts: ctx.filterCounts?.sets,
    mutedOptions: ctx.availableFilters.supplementalSets,
  }),
  domains: (ctx) => ({
    label: "Domain",
    searchPlaceholder: "Search domains…",
    emptyText: "No domains match.",
    options: ctx.availableFilters.domains.map((value) => ({
      value,
      label: formatDomainFilterLabel(value, ctx.labels.domains),
    })),
    selected: ctx.filterState.domains,
    excluded: ctx.filterState.domainsEx,
    onCycle: (value) => ctx.actions.cycleArrayFilter("domains", "domainsEx", value),
    icon: (value) => getFilterIconPath("domains", value),
    counts: ctx.filterCounts?.domains,
  }),
  rarities: (ctx) => ({
    label: "Rarity",
    searchPlaceholder: "Search rarities…",
    emptyText: "No rarities match.",
    options: ctx.availableFilters.rarities.map((value) => ({
      value,
      label: ctx.labels.rarities[value],
    })),
    selected: ctx.filterState.rarities,
    excluded: ctx.filterState.raritiesEx,
    onCycle: (value) => ctx.actions.cycleArrayFilter("rarities", "raritiesEx", value),
    icon: (value) => getFilterIconPath("rarities", value),
    counts: ctx.filterCounts?.rarities,
  }),
  types: (ctx) => ({
    label: "Type",
    searchPlaceholder: "Search types…",
    emptyText: "No types match.",
    options: ctx.availableFilters.types.map((value) => ({
      value,
      label: ctx.labels.cardTypes[value],
    })),
    selected: ctx.filterState.types,
    excluded: ctx.filterState.typesEx,
    onCycle: (value) => ctx.actions.cycleArrayFilter("types", "typesEx", value),
    icon: (value) => getFilterIconPath("types", value),
    iconAfterLabel: true,
    counts: ctx.filterCounts?.types,
  }),
  superTypes: (ctx) => ({
    label: "Supertype",
    searchPlaceholder: "Search supertypes…",
    emptyText: "No supertypes match.",
    options: ctx.availableFilters.superTypes.map((value) => ({
      value,
      label: ctx.labels.superTypes[value],
    })),
    selected: ctx.filterState.superTypes,
    excluded: ctx.filterState.superTypesEx,
    onCycle: (value) => ctx.actions.cycleArrayFilter("superTypes", "superTypesEx", value),
    icon: (value) => getFilterIconPath("superTypes", value),
    iconAfterLabel: true,
    counts: ctx.filterCounts?.superTypes,
  }),
  markers: (ctx) => ({
    label: "Markers",
    searchPlaceholder: "Search markers…",
    emptyText: "No markers match.",
    options: ctx.availableFilters.markers.map((marker) => ({
      value: marker.slug,
      label: marker.label,
    })),
    selected: ctx.filterState.markers,
    excluded: ctx.filterState.markersEx,
    onCycle: (value) => ctx.actions.cycleArrayFilter("markers", "markersEx", value),
    counts: ctx.filterCounts?.markers,
    flagPosition: "top",
    flags: [presenceFlag("markers", ctx.filterState.markersPresence, ctx)],
  }),
  channels: (ctx) => ({
    label: "Distribution Channels",
    searchPlaceholder: "Search distribution channels…",
    emptyText: "No distribution channels match.",
    options: ctx.availableFilters.distributionChannels.map((channel) => ({
      value: channel.slug,
      label: ctx.channelBreadcrumbs.get(channel.id) ?? channel.label,
    })),
    selected: ctx.filterState.channels,
    excluded: ctx.filterState.channelsEx,
    onCycle: (value) => ctx.actions.cycleArrayFilter("channels", "channelsEx", value),
    counts: ctx.filterCounts?.channels,
    flagPosition: "top",
    flags: [presenceFlag("distributionChannels", ctx.filterState.channelsPresence, ctx)],
  }),
  keywords: (ctx) => ({
    label: "Keywords",
    searchPlaceholder: "Search keywords…",
    emptyText: "No keywords match.",
    options: ctx.availableFilters.keywords.map((keyword) => ({
      value: keyword,
      label: keyword,
    })),
    selected: ctx.filterState.keywords,
    excluded: ctx.filterState.keywordsEx,
    onCycle: (value) => ctx.actions.cycleArrayFilter("keywords", "keywordsEx", value),
    counts: ctx.filterCounts?.keywords,
    flagPosition: "top",
    flags: [presenceFlag("keywords", ctx.filterState.keywordsPresence, ctx)],
  }),
};

// Kept outside DROPDOWNS: which axis is primary is decided by the host, which
// passes the placement and hiddenSections verdicts in.
export function FilterVariantDropdown({
  triggerStyle,
  availableFilters,
  filterCounts,
  showArtVariant,
  showFinish,
  showOvernumberedFlag,
  showSignedFlag,
  fitContent,
}: {
  triggerStyle: "chip" | "button" | "menu";
  availableFilters: AvailableFilters;
  filterCounts?: FilterCounts;
  showArtVariant: boolean;
  showFinish: boolean;
  showOvernumberedFlag: boolean;
  showSignedFlag: boolean;
  fitContent?: boolean;
}) {
  const { labels } = useEnumOrders();
  const { filterState } = useFilterValues();
  const { cycleArrayFilter, toggleSigned, toggleOvernumbered } = useFilterActions();
  const artVariantOptions = availableFilters.artVariants.map((value) => ({
    value,
    label: labels.artVariants[value],
  }));
  const finishOptions = availableFilters.finishes.map((value) => ({
    value,
    label: labels.finishes[value],
  }));
  const both = showArtVariant && showFinish;
  const primaryIsArt = showArtVariant;
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
  const overnumberedFlag = {
    label: "Overnumbered",
    state: filterState.overnumbered,
    count: filterCounts?.flags.overnumbered,
    onToggle: toggleOvernumbered,
  };
  const signedFlag = {
    label: "Signed",
    state: filterState.signed,
    count: filterCounts?.flags.signed,
    onToggle: toggleSigned,
  };
  const flags = [
    ...(showOvernumberedFlag ? [overnumberedFlag] : []),
    ...(showSignedFlag ? [signedFlag] : []),
  ];
  return (
    <MultiSelectCombobox
      triggerStyle={triggerStyle}
      label={both ? "Variant" : showArtVariant ? "Art Variant" : "Finish"}
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
      flags={flags}
      fitContent={fitContent}
    />
  );
}

// A component, not a props builder: a spread props object is a fresh value every
// render, so React Compiler could never cache the element.
export function FilterValueDropdown({
  dimension,
  triggerStyle,
  placeholder,
  availableFilters,
  availableLanguages,
  setDisplayLabel,
  filterCounts,
}: {
  /** A key of {@link DROPDOWNS} (also a `FILTER_DIMENSIONS` key). */
  dimension: string;
  triggerStyle: "chip" | "button" | "menu";
  /** Text shown in the trigger when empty; omitted for self-labelling chips/menu rows. */
  placeholder?: string;
  availableFilters: AvailableFilters;
  availableLanguages?: string[];
  setDisplayLabel?: (code: string) => string;
  filterCounts?: FilterCounts;
}) {
  const { labels } = useEnumOrders();
  const languageLabels = useLanguageLabels();
  const { filterState } = useFilterValues();
  const actions = useFilterActions();
  const channelBreadcrumbs = buildChannelBreadcrumbs(availableFilters.distributionChannels);
  const build = DROPDOWNS[dimension];
  if (!build) {
    throw new Error(`No filter dropdown defined for dimension: ${dimension}`);
  }
  const spec = build({
    availableFilters,
    availableLanguages,
    setDisplayLabel,
    filterCounts,
    filterState,
    actions,
    labels,
    languageLabels,
    channelBreadcrumbs,
  });
  return <MultiSelectCombobox {...spec} triggerStyle={triggerStyle} placeholder={placeholder} />;
}

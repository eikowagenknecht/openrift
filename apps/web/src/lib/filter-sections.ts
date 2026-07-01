import type { AvailableFilters } from "@openrift/shared";

export interface ToggleableFilterSection {
  key: string;
  /** Label shown in the customize popover (matches the panel's section label). */
  label: string;
}

/**
 * Every filter-panel section the user may opt to hide, in the order they
 * appear in the panel. Keys match the identifiers checked against
 * `hiddenSections` in `filter-panel-content.tsx`.
 */
export const TOGGLEABLE_FILTER_SECTIONS: readonly ToggleableFilterSection[] = [
  { key: "superTypes", label: "Supertype" },
  { key: "artVariants", label: "Art Variant" },
  { key: "finishes", label: "Finish" },
  { key: "cardSizes", label: "Size" },
  { key: "languages", label: "Language" },
  { key: "energy", label: "Energy" },
  { key: "power", label: "Power" },
  { key: "might", label: "Might" },
  { key: "price", label: "Price" },
  { key: "promo", label: "Promo" },
  { key: "markers", label: "Markers" },
  { key: "channels", label: "Distribution Channels" },
  { key: "customTags", label: "Custom Tags" },
  { key: "signed", label: "Signed" },
  { key: "banned", label: "Banned" },
  { key: "errata", label: "Errata" },
  { key: "owned", label: "Owned" },
];

const TOGGLEABLE_KEYS = new Set(TOGGLEABLE_FILTER_SECTIONS.map((section) => section.key));

/**
 * Drops core and unknown keys from a stored hidden-sections list, so a stale
 * or hand-edited preference can never hide a pinned section or carry junk.
 * @returns The input keys restricted to genuinely toggleable sections.
 */
export function keepToggleableSections(keys: Iterable<string>): string[] {
  return [...new Set(keys)].filter((key) => TOGGLEABLE_KEYS.has(key));
}

/**
 * Unions a surface's own contextual hides with the user's chosen hides
 * (restricted to toggleable keys) to get the effective set used for rendering.
 * @returns The combined set of sections to hide on this surface.
 */
export function mergeHiddenSections(
  surfaceHiddenSections: ReadonlySet<string> | undefined,
  userHiddenSections: Iterable<string>,
): ReadonlySet<string> {
  return new Set([...(surfaceHiddenSections ?? []), ...keepToggleableSections(userHiddenSections)]);
}

interface ApplicabilityInput {
  availableFilters: AvailableFilters;
  availableLanguages?: string[];
  /** The surface's own contextual hides (NOT merged with the user preference). */
  surfaceHiddenSections?: ReadonlySet<string>;
  /** Number of custom-tag categories visible on this surface (after any category filter). */
  customTagCategoryCount: number;
}

/**
 * Per-section "has content to show" predicates, mirroring the render guards in
 * `filter-panel-content.tsx`. Each ignores the user's hide choices — it only
 * asks whether the section would render at all on this surface. Stat sliders
 * and the owned bucket always render (`() => true`); the rest gate on the
 * matching `availableFilters` field.
 */
const HAS_CONTENT: Record<string, (input: ApplicabilityInput) => boolean> = {
  superTypes: ({ availableFilters }) => availableFilters.superTypes.length > 0,
  artVariants: ({ availableFilters }) => availableFilters.artVariants.length > 1,
  finishes: ({ availableFilters }) => availableFilters.finishes.length > 1,
  cardSizes: ({ availableFilters }) => availableFilters.cardSizes.length > 1,
  languages: ({ availableLanguages }) => (availableLanguages?.length ?? 0) > 1,
  energy: () => true,
  power: () => true,
  might: () => true,
  price: ({ availableFilters }) => availableFilters.price.max > 0,
  promo: ({ availableFilters }) => availableFilters.hasAnyMarker,
  markers: ({ availableFilters }) => availableFilters.markers.length > 0,
  channels: ({ availableFilters }) => availableFilters.distributionChannels.length > 0,
  customTags: ({ customTagCategoryCount }) => customTagCategoryCount > 0,
  signed: ({ availableFilters }) => availableFilters.hasSigned,
  banned: ({ availableFilters }) => availableFilters.hasBanned,
  errata: ({ availableFilters }) => availableFilters.hasErrata,
  owned: () => true,
};

/**
 * The toggleable sections worth offering in the customize popover for a given
 * surface: those with content to show that the surface doesn't already force
 * hidden. A section the surface hides itself (e.g. markers on /collections)
 * isn't offered, so toggling it could never be a no-op.
 * @returns The offerable toggleable sections, in panel order.
 */
export function getApplicableToggleableSections(
  input: ApplicabilityInput,
): ToggleableFilterSection[] {
  return TOGGLEABLE_FILTER_SECTIONS.filter(
    (section) =>
      !input.surfaceHiddenSections?.has(section.key) &&
      (HAS_CONTENT[section.key]?.(input) ?? false),
  );
}

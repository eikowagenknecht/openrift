import { PREFERENCE_DEFAULTS } from "@openrift/shared";

import type { FilterDimensionAvailability } from "@/lib/filter-dimensions";
import { sectionHasContent } from "@/lib/filter-dimensions";

export interface FilterPlacementUnit {
  /** Unit key stored in the `topLevelFilters` preference. */
  key: string;
  /** Label shown in the customize popover. */
  label: string;
  /**
   * Filter-panel section keys this unit covers. Placement operates on units
   * (e.g. one "Variant" unit spans Art Variant + Finish + Signed) so the
   * chrome never ends up in odd half-split states like "Energy top-level,
   * Might in More". Section keys still drive the surface-level `hiddenSections`
   * guards inside each renderer.
   */
  sections: readonly string[];
}

/**
 * Every placeable filter unit, in canonical order — the order the compact
 * bar renders its chips, the More menu lists its rows, and the customize
 * popover offers its choices, so all three always read the same way. A unit
 * is either "top
 * level" (an inline chip in the compact bar, a full section in the panel) or
 * "in More" (a row in the compact bar's More menu, inside the panel's
 * collapsed "More filters" fold). The `topLevelFilters` preference stores the
 * keys of the top-level units; everything else is in More.
 */
export const FILTER_PLACEMENT_UNITS: readonly FilterPlacementUnit[] = [
  { key: "languages", label: "Language", sections: ["languages"] },
  { key: "sets", label: "Set", sections: ["sets"] },
  { key: "domains", label: "Domain", sections: ["domains"] },
  { key: "rarities", label: "Rarity", sections: ["rarities"] },
  { key: "types", label: "Type", sections: ["types"] },
  { key: "superTypes", label: "Supertype", sections: ["superTypes"] },
  { key: "variant", label: "Variant", sections: ["artVariants", "finishes", "signed"] },
  { key: "standard", label: "Standard", sections: ["standard"] },
  { key: "stats", label: "Stats", sections: ["energy", "power", "might"] },
  { key: "markers", label: "Markers", sections: ["markers"] },
  { key: "cardSizes", label: "Size", sections: ["cardSizes"] },
  { key: "channels", label: "Distribution Channels", sections: ["channels"] },
  { key: "customTags", label: "Custom Tags", sections: ["customTags"] },
  { key: "tags", label: "Tags", sections: ["tags"] },
  { key: "keywords", label: "Keywords", sections: ["keywords"] },
  { key: "banned", label: "Banned", sections: ["banned"] },
  { key: "errata", label: "Errata", sections: ["errata"] },
  { key: "owned", label: "Owned", sections: ["owned"] },
  { key: "price", label: "Price", sections: ["price"] },
];

const UNIT_KEYS = new Set(FILTER_PLACEMENT_UNITS.map((unit) => unit.key));

/** The default top-level unit set, resolved once for fallbacks. */
export const DEFAULT_TOP_LEVEL_UNITS: ReadonlySet<string> = new Set(
  PREFERENCE_DEFAULTS.topLevelFilters,
);

/**
 * Drops unknown keys from a stored top-level-filters list, so a stale or
 * hand-edited preference can never carry junk into the placement logic.
 * @returns The input keys restricted to genuine placement units.
 */
export function keepPlacementUnits(keys: Iterable<string>): string[] {
  return [...new Set(keys)].filter((key) => UNIT_KEYS.has(key));
}

/**
 * Resolves the stored preference into the effective top-level unit set.
 * @returns The sanitized set of top-level unit keys.
 */
export function resolveTopLevelUnits(topLevelFilters: Iterable<string>): ReadonlySet<string> {
  return new Set(keepPlacementUnits(topLevelFilters));
}

interface ApplicabilityInput extends FilterDimensionAvailability {
  /** The surface's own contextual hides (section keys, NOT unit keys). */
  surfaceHiddenSections?: ReadonlySet<string>;
}

/**
 * Whether one section of a unit would render on this surface (has content and
 * isn't surface-hidden). The "has content" half lives in `FILTER_DIMENSIONS`,
 * so it is the same predicate the compact bar, the More menu and the chip
 * sections gate on.
 * @returns True when the section applies here.
 */
function sectionApplies(section: string, input: ApplicabilityInput): boolean {
  return !input.surfaceHiddenSections?.has(section) && sectionHasContent(section, input);
}

/**
 * The placement units worth offering in the customize popover (and worth
 * rendering anywhere) for a given surface: those with at least one section
 * that has content and isn't surface-hidden.
 * @returns The applicable units, in canonical order.
 */
export function getApplicablePlacementUnits(input: ApplicabilityInput): FilterPlacementUnit[] {
  return FILTER_PLACEMENT_UNITS.filter((unit) =>
    unit.sections.some((section) => sectionApplies(section, input)),
  );
}

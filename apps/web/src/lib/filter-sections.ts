import { PREFERENCE_DEFAULTS } from "@openrift/shared/types/api/preferences";

import type { FilterDimensionAvailability } from "@/lib/filter-dimensions";
import { sectionHasContent } from "@/lib/filter-dimensions";

export interface FilterPlacementUnit {
  key: string;
  label: string;
  sections: readonly string[];
}

export const FILTER_PLACEMENT_UNITS: readonly FilterPlacementUnit[] = [
  { key: "languages", label: "Language", sections: ["languages"] },
  { key: "sets", label: "Set", sections: ["sets"] },
  { key: "domains", label: "Domain", sections: ["domains"] },
  { key: "rarities", label: "Rarity", sections: ["rarities"] },
  { key: "types", label: "Type", sections: ["types"] },
  { key: "superTypes", label: "Supertype", sections: ["superTypes"] },
  {
    key: "variant",
    label: "Variant",
    sections: ["artVariants", "finishes", "overnumbered", "signed"],
  },
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

export const DEFAULT_TOP_LEVEL_UNITS: ReadonlySet<string> = new Set(
  PREFERENCE_DEFAULTS.topLevelFilters,
);

export function keepPlacementUnits(keys: Iterable<string>): string[] {
  return [...new Set(keys)].filter((key) => UNIT_KEYS.has(key));
}

export function resolveTopLevelUnits(topLevelFilters: Iterable<string>): ReadonlySet<string> {
  return new Set(keepPlacementUnits(topLevelFilters));
}

interface ApplicabilityInput extends FilterDimensionAvailability {
  surfaceHiddenSections?: ReadonlySet<string>;
}

function sectionApplies(section: string, input: ApplicabilityInput): boolean {
  return !input.surfaceHiddenSections?.has(section) && sectionHasContent(section, input);
}

export function getApplicablePlacementUnits(input: ApplicabilityInput): FilterPlacementUnit[] {
  return FILTER_PLACEMENT_UNITS.filter((unit) =>
    unit.sections.some((section) => sectionApplies(section, input)),
  );
}

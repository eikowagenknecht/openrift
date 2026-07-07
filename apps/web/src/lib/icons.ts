import { WellKnown } from "@openrift/shared";

type FilterCategory =
  | "sets"
  | "rarities"
  | "types"
  | "superTypes"
  | "domains"
  | "artVariants"
  | "finishes"
  | "cardSizes";

const SUPERTYPE_ICONS = new Set<string>([WellKnown.superType.CHAMPION]);

/**
 * Icon for a card's type row — uses the champion icon for Champion/Signature
 * Units, otherwise falls back to the standard type icon. Returns undefined
 * for types without an icon asset (e.g. "Other").
 * @returns Path to the SVG icon, or undefined if none exists.
 */
export function getTypeIconPath(type: string, superTypes: string[]): string | undefined {
  return getTypeIconPaths([type], superTypes)[0];
}

/**
 * Icons for a multi-type card's type row — one glyph per type, in printed
 * order (ADR-037). The champion icon substitutes for the unit glyph on
 * Champion/Signature Units; types without an asset (e.g. "Other") are skipped.
 * @returns SVG icon paths, one per type that has an asset.
 */
export function getTypeIconPaths(types: readonly string[], superTypes: string[]): string[] {
  const paths: string[] = [];
  for (const type of types) {
    const path = singleTypeIconPath(type, superTypes);
    if (path && !paths.includes(path)) {
      paths.push(path);
    }
  }
  return paths;
}

function singleTypeIconPath(type: string, superTypes: string[]): string | undefined {
  if (
    type === WellKnown.cardType.UNIT &&
    (superTypes.includes(WellKnown.superType.CHAMPION) ||
      superTypes.includes(WellKnown.superType.SIGNATURE))
  ) {
    return "/images/supertypes/champion.svg";
  }
  if (type === "other") {
    return undefined;
  }
  return `/images/types/${type.toLowerCase()}.svg`;
}

/**
 * Resolves the asset path for a filter-facet icon. Returns undefined for facets
 * that have no icon asset (the "other" card type, non-Champion supertypes).
 *
 * For rarities, `options.size` picks the badge variant: "thumbnail" (the
 * default) returns the 28×28 asset used in dense UI, "full" returns the
 * full-resolution asset used on card faces and the support tiers.
 * @returns The image path, or undefined if no asset exists for the facet.
 */
export function getFilterIconPath(
  category: FilterCategory,
  value: string,
  options?: { size?: "thumbnail" | "full" },
): string | undefined {
  const lower = value.toLowerCase();
  switch (category) {
    case "domains": {
      // Compare against `lower` so callers that pass non-canonical casing
      // (e.g. "Colorless") still resolve to the SVG path. Comparing against
      // the unlowered `value` would silently fall through to `.webp`, which
      // doesn't exist for colorless.
      return `/images/domains/${lower}.${lower === WellKnown.domain.COLORLESS ? "svg" : "webp"}`;
    }
    case "types": {
      if (value === "other") {
        return undefined;
      }
      return `/images/types/${lower}.svg`;
    }
    case "superTypes": {
      return SUPERTYPE_ICONS.has(value) ? `/images/supertypes/${lower}.svg` : undefined;
    }
    case "rarities": {
      const suffix = options?.size === "full" ? "" : "-28x28";
      return `/images/rarities/${lower}${suffix}.webp`;
    }
    default: {
      return undefined;
    }
  }
}

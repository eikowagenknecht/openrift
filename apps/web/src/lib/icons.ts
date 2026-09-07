import { WellKnown } from "@openrift/shared";

export type FilterCategory =
  | "sets"
  | "rarities"
  | "types"
  | "superTypes"
  | "domains"
  | "artVariants"
  | "finishes"
  | "cardSizes";

const SUPERTYPE_ICONS = new Set<string>([WellKnown.superType.CHAMPION]);

export function getTypeIconPath(type: string, superTypes: string[]): string | undefined {
  return getTypeIconPaths([type], superTypes)[0];
}

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

export function getFilterIconPath(
  category: FilterCategory,
  value: string,
  options?: { size?: "thumbnail" | "full" },
): string | undefined {
  const lower = value.toLowerCase();
  switch (category) {
    case "domains": {
      // Compare against `lower`: non-canonical casing (e.g. "Colorless") would
      // otherwise fall through to `.webp`, which doesn't exist for colorless.
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

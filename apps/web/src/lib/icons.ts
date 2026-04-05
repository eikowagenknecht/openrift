import { WellKnown } from "@openrift/shared";

type FilterCategory =
  | "sets"
  | "rarities"
  | "types"
  | "superTypes"
  | "domains"
  | "artVariants"
  | "finishes";

const SUPERTYPE_ICONS = new Set<string>([WellKnown.superType.CHAMPION]);

/**
 * Icon for a card's type row — uses the champion icon for Champion/Signature
 * Units, otherwise falls back to the standard type icon.
 * @returns Path to the SVG icon.
 */
export function getTypeIconPath(type: string, superTypes: string[]): string {
  if (
    type === WellKnown.cardType.UNIT &&
    (superTypes.includes(WellKnown.superType.CHAMPION) ||
      superTypes.includes(WellKnown.superType.SIGNATURE))
  ) {
    return "/images/supertypes/champion.svg";
  }
  return `/images/types/${type.toLowerCase()}.svg`;
}

export function getFilterIconPath(category: FilterCategory, value: string): string | undefined {
  const lower = value.toLowerCase();
  switch (category) {
    case "domains": {
      return `/images/domains/${lower}.${value === WellKnown.domain.COLORLESS ? "svg" : "webp"}`;
    }
    case "types": {
      return `/images/types/${lower}.svg`;
    }
    case "superTypes": {
      return SUPERTYPE_ICONS.has(value) ? `/images/supertypes/${lower}.svg` : undefined;
    }
    case "rarities": {
      return `/images/rarities/${lower}-28x28.webp`;
    }
    default: {
      return undefined;
    }
  }
}

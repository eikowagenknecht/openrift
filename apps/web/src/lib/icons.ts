import type { CardType, SuperType } from "@openrift/shared";
import { COLORLESS_DOMAIN } from "@openrift/shared";

type FilterCategory =
  | "sets"
  | "rarities"
  | "types"
  | "superTypes"
  | "domains"
  | "artVariants"
  | "finishes";

const SUPERTYPE_ICONS = new Set(["Champion" satisfies SuperType]);

/**
 * Icon for a card's type row — uses the champion icon for Champion/Signature
 * Units, otherwise falls back to the standard type icon.
 * @returns Path to the SVG icon.
 */
export function getTypeIconPath(type: string, superTypes: string[]): string {
  if (
    type === ("Unit" satisfies CardType) &&
    (superTypes.includes("Champion" satisfies SuperType) ||
      superTypes.includes("Signature" satisfies SuperType))
  ) {
    return "/images/supertypes/champion.svg";
  }
  return `/images/types/${type.toLowerCase()}.svg`;
}

export function getFilterIconPath(category: FilterCategory, value: string): string | undefined {
  const lower = value.toLowerCase();
  switch (category) {
    case "domains": {
      return `/images/domains/${lower}.${value === COLORLESS_DOMAIN ? "svg" : "webp"}`;
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

type FilterCategory = "sets" | "rarities" | "types" | "superTypes" | "domains" | "variants";

const SUPERTYPE_ICONS = new Set(["Champion", "Signature", "Token"]);

/**
 * Icon for a card's type row — uses the champion icon for Champion/Signature
 * Units, otherwise falls back to the standard type icon.
 * @returns Path to the SVG icon.
 */
export function getTypeIconPath(type: string, superTypes: string[]): string {
  if (type === "Unit" && (superTypes.includes("Champion") || superTypes.includes("Signature"))) {
    return "/icons/supertypes/champion.svg";
  }
  return `/icons/types/${type.toLowerCase()}.svg`;
}

export function getFilterIconPath(category: FilterCategory, value: string): string | undefined {
  const lower = value.toLowerCase();
  switch (category) {
    case "domains": {
      return `/icons/domains/${lower}.${value === "Colorless" ? "svg" : "webp"}`;
    }
    case "types": {
      return `/icons/types/${lower}.svg`;
    }
    case "superTypes": {
      return SUPERTYPE_ICONS.has(value) ? `/icons/supertypes/${lower}.svg` : undefined;
    }
    case "rarities": {
      return `/icons/rarities/${lower}.webp`;
    }
    default: {
      return undefined;
    }
  }
}

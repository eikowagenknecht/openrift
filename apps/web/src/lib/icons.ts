type FilterCategory = "sets" | "rarities" | "types" | "superTypes" | "domains" | "variants";

const SUPERTYPE_ICONS = new Set(["Champion", "Signature", "Token"]);

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

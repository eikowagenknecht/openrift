import type { FoilEffect, Marketplace } from "@openrift/shared";
import { ALL_MARKETPLACES } from "@openrift/shared";

import type { VisibleFields } from "@/lib/card-fields";
import { DEFAULT_VISIBLE_FIELDS } from "@/lib/card-fields";

const VALID_MARKETPLACES = new Set<string>(ALL_MARKETPLACES);
const VALID_FOIL_EFFECTS = new Set<string>(["none", "static", "animated"]);

interface SanitizedPreferences {
  showImages: boolean;
  fancyFan: boolean;
  foilEffect: FoilEffect;
  cardTilt: boolean;
  visibleFields: VisibleFields;
  marketplaceOrder: Marketplace[];
  theme?: "light" | "dark";
  maxColumns?: number | null;
}

/**
 * Validates and sanitizes preferences from any untrusted source (localStorage, server).
 * Every field is type-checked and falls back to a safe default if invalid.
 * @returns Sanitized preferences, or null if the input is not an object at all.
 */
export function sanitizePreferences(data: unknown): SanitizedPreferences | null {
  if (typeof data !== "object" || data === null) {
    return null;
  }
  const record = data as Record<string, unknown>;

  const showImages = typeof record.showImages === "boolean" ? record.showImages : true;

  // Migrate legacy `richEffects` boolean → new granular settings
  const legacyRich = typeof record.richEffects === "boolean" ? record.richEffects : undefined;

  const fancyFan = typeof record.fancyFan === "boolean" ? record.fancyFan : (legacyRich ?? true);
  const foilEffect: FoilEffect =
    typeof record.foilEffect === "string" && VALID_FOIL_EFFECTS.has(record.foilEffect)
      ? (record.foilEffect as FoilEffect)
      : legacyRich === false
        ? "none"
        : "animated";
  const cardTilt = typeof record.cardTilt === "boolean" ? record.cardTilt : (legacyRich ?? true);

  const theme = record.theme === "light" || record.theme === "dark" ? record.theme : undefined;

  const rawFields =
    typeof record.visibleFields === "object" && record.visibleFields !== null
      ? (record.visibleFields as Record<string, unknown>)
      : {};
  const visibleFields: VisibleFields = {
    number:
      typeof rawFields.number === "boolean" ? rawFields.number : DEFAULT_VISIBLE_FIELDS.number,
    title: typeof rawFields.title === "boolean" ? rawFields.title : DEFAULT_VISIBLE_FIELDS.title,
    type: typeof rawFields.type === "boolean" ? rawFields.type : DEFAULT_VISIBLE_FIELDS.type,
    rarity:
      typeof rawFields.rarity === "boolean" ? rawFields.rarity : DEFAULT_VISIBLE_FIELDS.rarity,
    price: typeof rawFields.price === "boolean" ? rawFields.price : DEFAULT_VISIBLE_FIELDS.price,
  };

  const safeOrder = Array.isArray(record.marketplaceOrder)
    ? record.marketplaceOrder.filter(
        (marketplace): marketplace is Marketplace =>
          typeof marketplace === "string" && VALID_MARKETPLACES.has(marketplace),
      )
    : [];

  const result: SanitizedPreferences = {
    showImages,
    fancyFan,
    foilEffect,
    cardTilt,
    visibleFields,
    marketplaceOrder: safeOrder.length > 0 ? safeOrder : [...ALL_MARKETPLACES],
  };

  if (theme) {
    result.theme = theme;
  }

  if (record.maxColumns === null || typeof record.maxColumns === "number") {
    result.maxColumns = record.maxColumns;
  }

  return result;
}

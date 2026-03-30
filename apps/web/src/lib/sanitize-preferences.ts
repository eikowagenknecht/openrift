import type { FoilEffect, Marketplace, Theme } from "@openrift/shared";
import { ALL_MARKETPLACES } from "@openrift/shared";

import type { DisplayOverrides } from "@/stores/display-store";

const VALID_MARKETPLACES = new Set<string>(ALL_MARKETPLACES);
const VALID_FOIL_EFFECTS = new Set<string>(["none", "static", "animated"]);
const VALID_THEMES = new Set<string>(["light", "dark", "auto"]);

interface SanitizedOverrides {
  overrides: DisplayOverrides;
  maxColumns?: number | null;
}

/**
 * Sanitizes persisted data (localStorage) into the overrides format.
 * Handles both the new `overrides` shape and the legacy flat shape.
 * @returns Sanitized overrides, or null if the input is not an object.
 */
export function sanitizeOverrides(data: unknown): SanitizedOverrides {
  if (typeof data !== "object" || data === null) {
    return { overrides: nullOverrides() };
  }
  const record = data as Record<string, unknown>;

  // New format: has an `overrides` key
  if (typeof record.overrides === "object" && record.overrides !== null) {
    const raw = record.overrides as Record<string, unknown>;
    return {
      overrides: sanitizeOverrideFields(raw),
      maxColumns:
        record.maxColumns === null || typeof record.maxColumns === "number"
          ? record.maxColumns
          : undefined,
    };
  }

  // Legacy flat format: migrate to overrides
  return {
    overrides: sanitizeLegacyFlat(record),
    maxColumns:
      record.maxColumns === null || typeof record.maxColumns === "number"
        ? record.maxColumns
        : undefined,
  };
}

/**
 * Sanitizes server response data (UserPreferencesResponse) into overrides.
 * Missing fields become null (use default).
 * @returns Display overrides.
 */
export function sanitizeServerResponse(data: unknown): DisplayOverrides {
  if (typeof data !== "object" || data === null) {
    return nullOverrides();
  }
  return sanitizeOverrideFields(data as Record<string, unknown>);
}

/**
 * Sanitizes a theme value from server or persisted data.
 * @returns The theme preference, or null for auto/default.
 */
export function sanitizeTheme(value: unknown): Theme | null {
  if (typeof value === "string" && VALID_THEMES.has(value)) {
    return value as Theme;
  }
  return null;
}

// ── Internal helpers ────────────────────────────────────────────────────────

function nullOverrides(): DisplayOverrides {
  return {
    showImages: null,
    fancyFan: null,
    foilEffect: null,
    cardTilt: null,
    marketplaceOrder: null,
  };
}

function sanitizeOverrideFields(record: Record<string, unknown>): DisplayOverrides {
  // Migrate legacy `richEffects` → new granular settings
  const legacyRich = typeof record.richEffects === "boolean" ? record.richEffects : undefined;

  const showImages = typeof record.showImages === "boolean" ? record.showImages : null;

  const fancyFan =
    typeof record.fancyFan === "boolean"
      ? record.fancyFan
      : legacyRich === undefined
        ? null
        : legacyRich;
  const foilEffect: FoilEffect | null =
    typeof record.foilEffect === "string" && VALID_FOIL_EFFECTS.has(record.foilEffect)
      ? (record.foilEffect as FoilEffect)
      : legacyRich === false
        ? "none"
        : null;
  const cardTilt =
    typeof record.cardTilt === "boolean"
      ? record.cardTilt
      : legacyRich === undefined
        ? null
        : legacyRich;

  const safeOrder = Array.isArray(record.marketplaceOrder)
    ? record.marketplaceOrder.filter(
        (marketplace): marketplace is Marketplace =>
          typeof marketplace === "string" && VALID_MARKETPLACES.has(marketplace),
      )
    : null;

  return {
    showImages,
    fancyFan,
    foilEffect,
    cardTilt,
    marketplaceOrder: safeOrder && safeOrder.length > 0 ? safeOrder : null,
  };
}

/**
 * Migrate the old flat persisted shape (pre-overrides) to DisplayOverrides.
 * @returns Display overrides with legacy values mapped to the new shape.
 */
function sanitizeLegacyFlat(record: Record<string, unknown>): DisplayOverrides {
  return sanitizeOverrideFields(record);
}

import type { CompletionScopePreference, Marketplace, Theme } from "@openrift/shared";
import { ALL_MARKETPLACES } from "@openrift/shared";

import type { DisplayOverrides } from "@/stores/display-store";

const VALID_MARKETPLACES = new Set<string>(ALL_MARKETPLACES);
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
 * Missing fields stay undefined so hydration preserves the localStorage value.
 * @returns Partial display overrides (undefined = server had no value for this field).
 */
export function sanitizeServerResponse(data: unknown): Partial<DisplayOverrides> {
  if (typeof data !== "object" || data === null) {
    return {};
  }
  const record = data as Record<string, unknown>;
  const result: Partial<DisplayOverrides> = {};

  if ("showImages" in record) {
    result.showImages = typeof record.showImages === "boolean" ? record.showImages : null;
  }
  if ("fancyFan" in record) {
    result.fancyFan = typeof record.fancyFan === "boolean" ? record.fancyFan : null;
  }
  if ("foilEffect" in record) {
    result.foilEffect =
      typeof record.foilEffect === "boolean"
        ? record.foilEffect
        : typeof record.foilEffect === "string"
          ? record.foilEffect !== "none"
          : null;
  }
  if ("cardTilt" in record) {
    result.cardTilt = typeof record.cardTilt === "boolean" ? record.cardTilt : null;
  }
  if ("marketplaceOrder" in record) {
    result.marketplaceOrder = Array.isArray(record.marketplaceOrder)
      ? record.marketplaceOrder.filter(
          (marketplace): marketplace is Marketplace =>
            typeof marketplace === "string" && VALID_MARKETPLACES.has(marketplace),
        )
      : null;
  }
  if ("languages" in record) {
    result.languages = Array.isArray(record.languages)
      ? record.languages.filter(
          (lang): lang is string => typeof lang === "string" && lang.length > 0,
        )
      : null;
  }
  if ("completionScope" in record) {
    result.completionScope = sanitizeCompletionScope(record.completionScope);
  }
  return result;
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
    languages: null,
    completionScope: null,
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
  // Migrate old tristate ("none"/"static"/"animated") → boolean
  const foilEffect: boolean | null =
    typeof record.foilEffect === "boolean"
      ? record.foilEffect
      : typeof record.foilEffect === "string"
        ? record.foilEffect !== "none"
        : legacyRich === false
          ? false
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

  const safeLanguages = Array.isArray(record.languages)
    ? record.languages.filter((lang): lang is string => typeof lang === "string" && lang.length > 0)
    : null;

  const safeCompletionScope = sanitizeCompletionScope(record.completionScope);

  return {
    showImages,
    fancyFan,
    foilEffect,
    cardTilt,
    marketplaceOrder: safeOrder,
    languages: safeLanguages,
    completionScope: safeCompletionScope,
  };
}

function sanitizeCompletionScope(value: unknown): CompletionScopePreference | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const result: CompletionScopePreference = {};
  if (Array.isArray(record.languages)) {
    const safe = record.languages.filter((lang): lang is string => typeof lang === "string");
    if (safe.length > 0) {
      result.languages = safe;
    }
  }
  if (Array.isArray(record.finishes)) {
    const safe = record.finishes.filter((finish): finish is string => typeof finish === "string");
    if (safe.length > 0) {
      result.finishes = safe;
    }
  }
  if (Array.isArray(record.artVariants)) {
    const safe = record.artVariants.filter(
      (variant): variant is string => typeof variant === "string",
    );
    if (safe.length > 0) {
      result.artVariants = safe;
    }
  }
  if (record.promos === "only" || record.promos === "exclude") {
    result.promos = record.promos;
  }
  return Object.keys(result).length > 0 ? result : null;
}

/**
 * Migrate the old flat persisted shape (pre-overrides) to DisplayOverrides.
 * @returns Display overrides with legacy values mapped to the new shape.
 */
function sanitizeLegacyFlat(record: Record<string, unknown>): DisplayOverrides {
  return sanitizeOverrideFields(record);
}

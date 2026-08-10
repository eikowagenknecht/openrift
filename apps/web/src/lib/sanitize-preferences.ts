import type {
  CompletionScopePreference,
  Currency,
  Marketplace,
  Palette,
  Theme,
} from "@openrift/shared";
import { ALL_MARKETPLACES, CURRENCIES, PALETTES, RENAMED_LANGUAGES } from "@openrift/shared";

import type { DisplayMode, DisplayOverrides } from "@/stores/display-store";

const VALID_MARKETPLACES = new Set<string>(ALL_MARKETPLACES);
const VALID_THEMES = new Set<string>(["light", "dark", "auto"]);
const VALID_PALETTES = new Set<string>(PALETTES);
const VALID_DEFAULT_CARD_VIEWS = new Set<string>(["cards", "printings"]);
const VALID_CURRENCIES = new Set<string>(CURRENCIES);

/**
 * Filters a persisted language array to non-empty strings and rewrites codes
 * retired by a rename. Migration 204 handles the server-side copy of this
 * array; localStorage is out of its reach, so the remap happens on read.
 * Deduped because the contract rejects repeats, and a user holding both the old
 * and new code would otherwise end up with two of the same.
 *
 * Languages are DB rows rather than a compile-time enum, so this only rewrites
 * known-dead codes and deliberately doesn't validate the rest.
 * @param value Raw persisted value, any shape.
 * @returns The cleaned code list, or null when the input isn't an array.
 */
function sanitizeLanguageList(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const cleaned = value
    .filter((lang): lang is string => typeof lang === "string" && lang.length > 0)
    .map((lang) => RENAMED_LANGUAGES[lang] ?? lang);
  return [...new Set(cleaned)];
}

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
    result.languages = sanitizeLanguageList(record.languages);
  }
  if ("completionScope" in record) {
    result.completionScope = sanitizeCompletionScope(record.completionScope);
  }
  if ("defaultCardView" in record) {
    result.defaultCardView = sanitizeDefaultCardView(record.defaultCardView);
  }
  if ("defaultCurrency" in record) {
    result.defaultCurrency = sanitizeCurrency(record.defaultCurrency);
  }
  if ("topLevelFilters" in record) {
    result.topLevelFilters = sanitizeFilterKeyList(record.topLevelFilters);
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

/**
 * Sanitizes a palette value from server or persisted data.
 * @returns The palette preference, or null for default.
 */
export function sanitizePalette(value: unknown): Palette | null {
  if (typeof value === "string" && VALID_PALETTES.has(value)) {
    return value as Palette;
  }
  return null;
}

// ── Persisted-blob migrations ───────────────────────────────────────────────
//
// These read straight off a persisted localStorage/cookie blob rather than off
// a typed state object, because a zustand `merge` is the only shape-migration
// hook the stores have (an explicit persist `version` would make an older
// bundle discard a newer blob outright). They live here so the migration
// ladders are reachable from a test.

/**
 * Reads the persisted card-count overlay flag, migrating the legacy
 * `catalogMode` tri-state that preceded it: "off" meant no overlay, while
 * "count" and "add" both surfaced counts.
 * @param data Raw persisted blob, any shape.
 * @param fallback Value to keep when the blob carries neither key.
 * @returns Whether catalog cards show owned counts.
 */
export function sanitizeCardsShowCounts(data: unknown, fallback: boolean): boolean {
  const record = asRecord(data);
  if (typeof record.cardsShowCounts === "boolean") {
    return record.cardsShowCounts;
  }
  const legacy = record.catalogMode;
  if (legacy === "off") {
    return false;
  }
  if (legacy === "count" || legacy === "add") {
    return true;
  }
  return fallback;
}

/**
 * Reads the persisted grid/table choice, rejecting anything outside the union.
 * @param data Raw persisted blob, any shape.
 * @param fallback Value to keep when the blob carries no valid mode.
 * @returns The stored display mode.
 */
export function sanitizeDisplayMode(data: unknown, fallback: DisplayMode): DisplayMode {
  const raw = asRecord(data).displayMode;
  return raw === "grid" || raw === "table" ? raw : fallback;
}

/**
 * Reads the persisted filter-bar expansion flag.
 * @param data Raw persisted blob, any shape.
 * @param fallback Value to keep when the blob carries no boolean.
 * @returns Whether the filter bar starts expanded.
 */
export function sanitizeFiltersExpanded(data: unknown, fallback: boolean): boolean {
  const raw = asRecord(data).filtersExpanded;
  return typeof raw === "boolean" ? raw : fallback;
}

/**
 * Reads the persisted docked-detail-pane flag. Blobs written before the pane
 * became opt-in carry no such key, so those users land on the default (closed)
 * and meet the card modal instead.
 * @param data Raw persisted blob, any shape.
 * @param fallback Value to keep when the blob carries no boolean.
 * @returns Whether the card detail pane stays docked beside the grid.
 */
export function sanitizePaneDocked(data: unknown, fallback: boolean): boolean {
  const raw = asRecord(data).paneDocked;
  return typeof raw === "boolean" ? raw : fallback;
}

/**
 * Reads the persisted theme preference, migrating the legacy `theme` key that
 * held it before the store split stored preference from resolved theme.
 * @param data Raw persisted blob, any shape.
 * @returns The theme preference, or null for auto/default.
 */
export function sanitizeThemePreference(data: unknown): Theme | null {
  const record = asRecord(data);
  return sanitizeTheme(record.preference === undefined ? record.theme : record.preference);
}

// ── Internal helpers ────────────────────────────────────────────────────────

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function nullOverrides(): DisplayOverrides {
  return {
    showImages: null,
    fancyFan: null,
    foilEffect: null,
    cardTilt: null,
    marketplaceOrder: null,
    languages: null,
    completionScope: null,
    defaultCardView: null,
    defaultCurrency: null,
    topLevelFilters: null,
  };
}

function sanitizeDefaultCardView(value: unknown): "cards" | "printings" | null {
  if (typeof value === "string" && VALID_DEFAULT_CARD_VIEWS.has(value)) {
    return value as "cards" | "printings";
  }
  return null;
}

function sanitizeCurrency(value: unknown): Currency | null {
  if (typeof value === "string" && VALID_CURRENCIES.has(value)) {
    return value as Currency;
  }
  return null;
}

/**
 * Sanitizes a filter key list (top-level units, or the legacy hidden
 * sections). Keeps only non-empty strings and de-duplicates. Returns null for
 * anything that isn't an array so hydration falls back to the existing value.
 * @returns A de-duplicated list of keys, or null if the input is invalid.
 */
function sanitizeFilterKeyList(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const safe = value.filter(
    (section): section is string => typeof section === "string" && section.length > 0,
  );
  return [...new Set(safe)];
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

  const safeLanguages = sanitizeLanguageList(record.languages);

  const safeCompletionScope = sanitizeCompletionScope(record.completionScope);

  const safeDefaultCardView = sanitizeDefaultCardView(record.defaultCardView);

  const safeDefaultCurrency = sanitizeCurrency(record.defaultCurrency);

  const safeTopLevelFilters = sanitizeFilterKeyList(record.topLevelFilters);

  return {
    showImages,
    fancyFan,
    foilEffect,
    cardTilt,
    marketplaceOrder: safeOrder,
    languages: safeLanguages,
    completionScope: safeCompletionScope,
    defaultCardView: safeDefaultCardView,
    defaultCurrency: safeDefaultCurrency,
    topLevelFilters: safeTopLevelFilters,
  };
}

function sanitizeCompletionScope(value: unknown): CompletionScopePreference | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const result: CompletionScopePreference = {};
  const safeLanguages = sanitizeLanguageList(record.languages);
  if (safeLanguages && safeLanguages.length > 0) {
    result.languages = safeLanguages;
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

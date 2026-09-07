import type {
  CompletionScopePreference,
  Currency,
  Marketplace,
  Palette,
  Theme,
} from "@openrift/shared";
import { ALL_MARKETPLACES, CURRENCIES, PALETTES, RENAMED_LANGUAGES } from "@openrift/shared";

import type { DisplayMode, DisplayOverrides, MetaDeckView } from "@/stores/display-store";
import { NULL_OVERRIDES } from "@/stores/display-store";

const VALID_MARKETPLACES = new Set<string>(ALL_MARKETPLACES);
const VALID_THEMES = new Set<string>(["light", "dark", "auto"]);
const VALID_PALETTES = new Set<string>(PALETTES);
const VALID_DEFAULT_CARD_VIEWS = new Set<string>(["cards", "printings"]);
const VALID_CURRENCIES = new Set<string>(CURRENCIES);

/**
 * Rewrites codes retired by a rename (localStorage isn't covered by the DB
 * migration for it) and dedupes, since the contract rejects repeated codes.
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

export function sanitizeOverrides(data: unknown): SanitizedOverrides {
  if (typeof data !== "object" || data === null) {
    return { overrides: { ...NULL_OVERRIDES } };
  }
  const record = data as Record<string, unknown>;

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

  return {
    overrides: sanitizeLegacyFlat(record),
    maxColumns:
      record.maxColumns === null || typeof record.maxColumns === "number"
        ? record.maxColumns
        : undefined,
  };
}

/** Missing fields stay undefined so hydration keeps the existing localStorage value. */
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

export function sanitizeTheme(value: unknown): Theme | null {
  if (typeof value === "string" && VALID_THEMES.has(value)) {
    return value as Theme;
  }
  return null;
}

export function sanitizePalette(value: unknown): Palette | null {
  if (typeof value === "string" && VALID_PALETTES.has(value)) {
    return value as Palette;
  }
  return null;
}

// Shape migrations go through zustand's `merge`, never a `version` bump: a version bump discards a newer persisted blob.

/** Migrates the legacy `catalogMode` tri-state: "off" meant no overlay, "count" and "add" both meant show counts. */
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

export function sanitizeDisplayMode(data: unknown, fallback: DisplayMode): DisplayMode {
  const raw = asRecord(data).displayMode;
  return raw === "grid" || raw === "table" ? raw : fallback;
}

export function sanitizeMetaDeckView(data: unknown, fallback: MetaDeckView): MetaDeckView {
  const raw = asRecord(data).metaDeckView;
  return raw === "list" || raw === "grid" ? raw : fallback;
}

export function sanitizeFiltersExpanded(data: unknown, fallback: boolean): boolean {
  const raw = asRecord(data).filtersExpanded;
  return typeof raw === "boolean" ? raw : fallback;
}

/** Blobs from before the pane was opt-in carry no key, so those users land on the closed default. */
export function sanitizePaneDocked(data: unknown, fallback: boolean): boolean {
  const raw = asRecord(data).paneDocked;
  return typeof raw === "boolean" ? raw : fallback;
}

export function sanitizeFrostedBars(data: unknown, fallback: boolean): boolean {
  const raw = asRecord(data).frostedBars;
  return typeof raw === "boolean" ? raw : fallback;
}

/** Stored as a step index, not a pixel width, so widening the ladder later can't strand a saved value between two steps. */
export function sanitizeTierTileStep(data: unknown, stepCount: number, fallback: number): number {
  const raw = asRecord(data).tierTileStep;
  return typeof raw === "number" && Number.isInteger(raw) && raw >= 0 && raw < stepCount
    ? raw
    : fallback;
}

/** Migrates the legacy `theme` key, used before the store split preference from resolved theme. */
export function sanitizeThemePreference(data: unknown): Theme | null {
  const record = asRecord(data);
  return sanitizeTheme(record.preference === undefined ? record.theme : record.preference);
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
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
  const legacyRich = typeof record.richEffects === "boolean" ? record.richEffects : undefined;

  const showImages = typeof record.showImages === "boolean" ? record.showImages : null;

  const fancyFan = typeof record.fancyFan === "boolean" ? record.fancyFan : (legacyRich ?? null);
  const foilEffect: boolean | null =
    typeof record.foilEffect === "boolean"
      ? record.foilEffect
      : typeof record.foilEffect === "string"
        ? record.foilEffect !== "none"
        : legacyRich === false
          ? false
          : null;
  const cardTilt = typeof record.cardTilt === "boolean" ? record.cardTilt : (legacyRich ?? null);

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

function sanitizeLegacyFlat(record: Record<string, unknown>): DisplayOverrides {
  return sanitizeOverrideFields(record);
}

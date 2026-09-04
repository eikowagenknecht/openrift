import type {
  DisplayPreferenceKey,
  DisplayPreferenceOverrides,
  DisplayPreferences,
} from "@openrift/shared";
import { DISPLAY_PREFERENCE_KEYS, PREFERENCE_DEFAULTS } from "@openrift/shared";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import {
  sanitizeCardsShowCounts,
  sanitizeDisplayMode,
  sanitizeFiltersExpanded,
  sanitizeFrostedBars,
  sanitizeMetaDeckView,
  sanitizeOverrides,
  sanitizePaneDocked,
  sanitizeTierTileStep,
} from "@/lib/sanitize-preferences";

/** Whether the card browser renders a grid of cards or a table of rows. */
export type DisplayMode = "grid" | "table";

/** Whether the archived-deck browser renders rows or tiles. */
export type MetaDeckView = "list" | "grid";

/**
 * Tile widths the tier board steps through, in pixels. A ladder rather than a
 * free number: the board's rows size themselves off the tile, so arbitrary
 * widths would let a creator land on a row height that reads as a mistake.
 */
export const TIER_TILE_WIDTHS = [40, 48, 56, 72, 88, 112] as const;

/** Step the board starts on — the size the ladder was designed around. */
const DEFAULT_TIER_TILE_STEP = 2;

// ── Override types (nullable — null means "use default") ────────────────────

/** The store's name for the shape, which lives with the preferences it mirrors. */
export type DisplayOverrides = DisplayPreferenceOverrides;

export const NULL_OVERRIDES: DisplayOverrides = Object.fromEntries(
  DISPLAY_PREFERENCE_KEYS.map((key) => [key, null]),
) as DisplayOverrides;

// ── Resolve helpers ─────────────────────────────────────────────────────────

/**
 * Fills every unset override from {@link PREFERENCE_DEFAULTS}. Array and object
 * defaults are copied, so a resolved value is never the shared default instance.
 *
 * @returns Every display preference, concrete.
 */
function resolveAll(overrides: DisplayOverrides): DisplayPreferences {
  const resolved: Record<string, unknown> = {};
  for (const key of DISPLAY_PREFERENCE_KEYS) {
    const override = overrides[key];
    const value = override ?? PREFERENCE_DEFAULTS[key];
    resolved[key] = Array.isArray(value)
      ? [...value]
      : typeof value === "object" && value !== null
        ? { ...value }
        : value;
  }
  return resolved as DisplayPreferences;
}

// ── Store ───────────────────────────────────────────────────────────────────

interface DisplayState extends DisplayPreferences {
  // Resolved values (from DisplayPreferences) are always concrete, read by
  // components. Nullable overrides are persisted to localStorage and synced to DB.
  overrides: DisplayOverrides;

  // True once server prefs have been merged (or we know none exist). Consumers
  // that depend on authoritative prefs (e.g. seeding URL filters on mount) can
  // wait on this rather than reading potentially-stale localStorage values.
  prefsHydrated: boolean;
  markPrefsHydrated: () => void;

  // Setters (explicitly set a preference)
  setShowImages: (value: DisplayPreferences["showImages"]) => void;
  setFancyFan: (value: DisplayPreferences["fancyFan"]) => void;
  setFoilEffect: (value: DisplayPreferences["foilEffect"]) => void;
  setCardTilt: (value: DisplayPreferences["cardTilt"]) => void;
  setMarketplaceOrder: (value: DisplayPreferences["marketplaceOrder"]) => void;
  setLanguages: (value: DisplayPreferences["languages"]) => void;
  setCompletionScope: (value: DisplayPreferences["completionScope"]) => void;
  setDefaultCardView: (value: DisplayPreferences["defaultCardView"]) => void;
  setDefaultCurrency: (value: DisplayPreferences["defaultCurrency"]) => void;
  setTopLevelFilters: (value: DisplayPreferences["topLevelFilters"]) => void;

  // Reset a top-level preference to its default
  resetPreference: (key: DisplayPreferenceKey) => void;

  // Clear all account-scoped overrides (used on sign-out so the next visitor
  // sees the unauthenticated defaults). Device-local state (maxColumns,
  // filtersExpanded, cardsShowCounts, displayMode) is preserved.
  reset: () => void;

  // Hydrate overrides from server data (used by sync hook)
  hydrateOverrides: (incoming: Partial<DisplayOverrides>) => void;

  // Device-local — not synced
  maxColumns: number | null;
  setMaxColumns: (value: number | null | ((prev: number | null) => number | null)) => void;
  filtersExpanded: boolean;
  setFiltersExpanded: (value: boolean) => void;
  cardsShowCounts: boolean;
  toggleCardsShowCounts: () => void;
  displayMode: DisplayMode;
  setDisplayMode: (value: "grid" | "table") => void;
  metaDeckView: MetaDeckView;
  setMetaDeckView: (value: MetaDeckView) => void;
  /**
   * Whether the card detail pane stays docked beside the grid. Off by default:
   * a card click then opens the detail modal instead, so clicking never
   * reflows the grid under the pointer. Device-local, shared by every
   * card-browser surface.
   */
  paneDocked: boolean;
  setPaneDocked: (value: boolean) => void;
  /**
   * Frosted (blurred) backgrounds on the bars that pin above scrolling content.
   * Off by default and device-local rather than account-synced: whether the
   * effect is affordable depends on the device in hand, not on who is signed
   * in — see `lib/sticky-surface.ts` for the measured cost.
   */
  frostedBars: boolean;
  setFrostedBars: (value: boolean) => void;
  /**
   * Index into {@link TIER_TILE_WIDTHS} for the tier board's card tiles.
   * Device-local: how large the ladder should read depends on the screen the
   * creator is recording from, not on their account.
   */
  tierTileStep: number;
  setTierTileStep: (value: number) => void;
}

export const useDisplayStore = create<DisplayState>()(
  persist(
    (set) => ({
      // Start with all defaults (overrides all null)
      ...resolveAll(NULL_OVERRIDES),
      overrides: { ...NULL_OVERRIDES },
      prefsHydrated: false,
      markPrefsHydrated: () => set({ prefsHydrated: true }),

      setShowImages: (value) =>
        set((state) => ({
          showImages: value,
          overrides: { ...state.overrides, showImages: value },
        })),
      setFancyFan: (value) =>
        set((state) => ({
          fancyFan: value,
          overrides: { ...state.overrides, fancyFan: value },
        })),
      setFoilEffect: (value) =>
        set((state) => ({
          foilEffect: value,
          overrides: { ...state.overrides, foilEffect: value },
        })),
      setCardTilt: (value) =>
        set((state) => ({
          cardTilt: value,
          overrides: { ...state.overrides, cardTilt: value },
        })),
      setMarketplaceOrder: (value) =>
        set((state) => ({
          marketplaceOrder: value,
          overrides: { ...state.overrides, marketplaceOrder: value },
        })),
      setLanguages: (value) =>
        set((state) => ({
          languages: value,
          overrides: { ...state.overrides, languages: value },
        })),
      setCompletionScope: (value) =>
        set((state) => ({
          completionScope: value,
          overrides: { ...state.overrides, completionScope: value },
        })),
      setDefaultCardView: (value) =>
        set((state) => ({
          defaultCardView: value,
          overrides: { ...state.overrides, defaultCardView: value },
        })),
      setDefaultCurrency: (value) =>
        set((state) => ({
          defaultCurrency: value,
          overrides: { ...state.overrides, defaultCurrency: value },
        })),
      setTopLevelFilters: (value) =>
        set((state) => ({
          topLevelFilters: value,
          overrides: { ...state.overrides, topLevelFilters: value },
        })),

      resetPreference: (key) =>
        set((state) => {
          const newOverrides = { ...state.overrides, [key]: null };
          return { [key]: resolveAll(newOverrides)[key], overrides: newOverrides };
        }),

      reset: () =>
        set({
          overrides: { ...NULL_OVERRIDES },
          ...resolveAll(NULL_OVERRIDES),
        }),

      hydrateOverrides: (incoming) =>
        set((state) => {
          // Merge: only overwrite fields the server explicitly provided.
          // Undefined fields keep the existing localStorage value.
          const merged = { ...state.overrides };
          for (const key of DISPLAY_PREFERENCE_KEYS) {
            const value = incoming[key];
            if (value !== undefined) {
              // Each key's override type matches its own slot; the loop widens
              // both sides to the union, which TS can't pair up per-iteration.
              (merged[key] as unknown) = value;
            }
          }
          return { overrides: merged, ...resolveAll(merged), prefsHydrated: true };
        }),

      maxColumns: null,
      setMaxColumns: (value) =>
        set((state) => ({
          maxColumns: typeof value === "function" ? value(state.maxColumns) : value,
        })),
      filtersExpanded: false,
      setFiltersExpanded: (value) => set({ filtersExpanded: value }),
      cardsShowCounts: true,
      toggleCardsShowCounts: () => set((state) => ({ cardsShowCounts: !state.cardsShowCounts })),
      displayMode: "grid" as const,
      setDisplayMode: (value) => set({ displayMode: value }),
      metaDeckView: "list" as const,
      setMetaDeckView: (value) => set({ metaDeckView: value }),
      paneDocked: false,
      setPaneDocked: (value) => set({ paneDocked: value }),
      frostedBars: false,
      setFrostedBars: (value) => set({ frostedBars: value }),
      tierTileStep: DEFAULT_TIER_TILE_STEP,
      setTierTileStep: (value) =>
        set({ tierTileStep: Math.max(0, Math.min(value, TIER_TILE_WIDTHS.length - 1)) }),
    }),
    {
      name: "user-preferences",
      partialize: (state) => ({
        overrides: state.overrides,
        maxColumns: state.maxColumns,
        filtersExpanded: state.filtersExpanded,
        cardsShowCounts: state.cardsShowCounts,
        displayMode: state.displayMode,
        metaDeckView: state.metaDeckView,
        paneDocked: state.paneDocked,
        frostedBars: state.frostedBars,
        tierTileStep: state.tierTileStep,
      }),
      merge: (persisted, current) => {
        const safe = sanitizeOverrides(persisted);
        return {
          ...current,
          overrides: safe.overrides,
          ...resolveAll(safe.overrides),
          maxColumns: safe.maxColumns ?? current.maxColumns,
          filtersExpanded: sanitizeFiltersExpanded(persisted, current.filtersExpanded),
          cardsShowCounts: sanitizeCardsShowCounts(persisted, current.cardsShowCounts),
          displayMode: sanitizeDisplayMode(persisted, current.displayMode),
          metaDeckView: sanitizeMetaDeckView(persisted, current.metaDeckView),
          paneDocked: sanitizePaneDocked(persisted, current.paneDocked),
          frostedBars: sanitizeFrostedBars(persisted, current.frostedBars),
          tierTileStep: sanitizeTierTileStep(
            persisted,
            TIER_TILE_WIDTHS.length,
            current.tierTileStep,
          ),
        };
      },
    },
  ),
);

// Applied as a document attribute rather than a React prop: the app hydrates the
// whole document, so rendering a preference-derived attribute on <html> would
// mismatch the server (which cannot know a localStorage value) and trip React
// #418. The CSS variants in lib/sticky-surface.ts key off it.
function applyFrostedBars(on: boolean) {
  if (on) {
    document.documentElement.dataset.frosted = "";
  } else {
    delete document.documentElement.dataset.frosted;
  }
}

if (typeof document !== "undefined") {
  applyFrostedBars(useDisplayStore.getState().frostedBars);
  useDisplayStore.subscribe((state) => applyFrostedBars(state.frostedBars));
}

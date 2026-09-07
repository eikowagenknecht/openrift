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

export type DisplayMode = "grid" | "table";

export type MetaDeckView = "list" | "grid";

/** Tile widths the tier board steps through. The board's rows size off the tile, so a free width could land on a mistaken row height. */
export const TIER_TILE_WIDTHS = [40, 48, 56, 72, 88, 112] as const;

const DEFAULT_TIER_TILE_STEP = 2;

export type DisplayOverrides = DisplayPreferenceOverrides;

export const NULL_OVERRIDES: DisplayOverrides = Object.fromEntries(
  DISPLAY_PREFERENCE_KEYS.map((key) => [key, null]),
) as DisplayOverrides;

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

interface DisplayState extends DisplayPreferences {
  overrides: DisplayOverrides;

  prefsHydrated: boolean;
  markPrefsHydrated: () => void;

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

  resetPreference: (key: DisplayPreferenceKey) => void;

  // Clears account-scoped overrides only; device-local state is preserved.
  reset: () => void;

  hydrateOverrides: (incoming: Partial<DisplayOverrides>) => void;

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
  paneDocked: boolean;
  setPaneDocked: (value: boolean) => void;
  // Device-local, not account-synced: affordability depends on the device.
  // See lib/sticky-surface.ts for the measured cost.
  frostedBars: boolean;
  setFrostedBars: (value: boolean) => void;
  // Index into TIER_TILE_WIDTHS; device-local since it depends on the recording screen.
  tierTileStep: number;
  setTierTileStep: (value: number) => void;
}

export const useDisplayStore = create<DisplayState>()(
  persist(
    (set) => ({
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

// A React prop here would mismatch server-rendered HTML (React #418) since the
// server can't know a localStorage value; lib/sticky-surface.ts keys off this attribute.
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

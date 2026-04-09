import type { Marketplace } from "@openrift/shared";
import { PREFERENCE_DEFAULTS } from "@openrift/shared";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { sanitizeOverrides } from "@/lib/sanitize-preferences";

// ── Override types (nullable — null means "use default") ────────────────────

export interface DisplayOverrides {
  showImages: boolean | null;
  fancyFan: boolean | null;
  foilEffect: boolean | null;
  cardTilt: boolean | null;
  marketplaceOrder: Marketplace[] | null;
  languages: string[] | null;
}

const NULL_OVERRIDES: DisplayOverrides = {
  showImages: null,
  fancyFan: null,
  foilEffect: null,
  cardTilt: null,
  marketplaceOrder: null,
  languages: null,
};

// ── Resolve helpers ─────────────────────────────────────────────────────────

function resolveAll(overrides: DisplayOverrides) {
  return {
    showImages: overrides.showImages ?? PREFERENCE_DEFAULTS.showImages,
    fancyFan: overrides.fancyFan ?? PREFERENCE_DEFAULTS.fancyFan,
    foilEffect: overrides.foilEffect ?? PREFERENCE_DEFAULTS.foilEffect,
    cardTilt: overrides.cardTilt ?? PREFERENCE_DEFAULTS.cardTilt,
    marketplaceOrder: overrides.marketplaceOrder ?? [...PREFERENCE_DEFAULTS.marketplaceOrder],
    languages: overrides.languages ?? [...PREFERENCE_DEFAULTS.languages],
  };
}

// ── Store ───────────────────────────────────────────────────────────────────

interface DisplayState {
  // Resolved values — always concrete, read by components
  showImages: boolean;
  fancyFan: boolean;
  foilEffect: boolean;
  cardTilt: boolean;
  marketplaceOrder: Marketplace[];
  languages: string[];

  // Nullable overrides — persisted to localStorage and synced to DB
  overrides: DisplayOverrides;

  // Setters (explicitly set a preference)
  setShowImages: (value: boolean) => void;
  setFancyFan: (value: boolean) => void;
  setFoilEffect: (value: boolean) => void;
  setCardTilt: (value: boolean) => void;
  setMarketplaceOrder: (value: Marketplace[]) => void;
  setLanguages: (value: string[]) => void;

  // Reset a top-level preference to its default
  resetPreference: (
    key: "showImages" | "fancyFan" | "foilEffect" | "cardTilt" | "marketplaceOrder" | "languages",
  ) => void;

  // Hydrate overrides from server data (used by sync hook)
  hydrateOverrides: (incoming: DisplayOverrides) => void;

  // Device-local — not synced
  maxColumns: number | null;
  setMaxColumns: (value: number | null | ((prev: number | null) => number | null)) => void;
  filtersExpanded: boolean;
  setFiltersExpanded: (value: boolean) => void;
  showOwnedCount: boolean;
  setShowOwnedCount: (value: boolean) => void;

  // Layout state (derived from viewport, not persisted)
  physicalMax: number;
  setPhysicalMax: (value: number) => void;
  physicalMin: number;
  setPhysicalMin: (value: number) => void;
  autoColumns: number;
  setAutoColumns: (value: number) => void;
}

export const useDisplayStore = create<DisplayState>()(
  persist(
    (set) => ({
      // Start with all defaults (overrides all null)
      ...resolveAll(NULL_OVERRIDES),
      overrides: { ...NULL_OVERRIDES },

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

      resetPreference: (key) =>
        set((state) => {
          const newOverrides = { ...state.overrides, [key]: null };
          return { [key]: resolveAll(newOverrides)[key], overrides: newOverrides };
        }),

      hydrateOverrides: (incoming) =>
        set(() => ({
          overrides: incoming,
          ...resolveAll(incoming),
        })),

      maxColumns: null,
      setMaxColumns: (value) =>
        set((state) => ({
          maxColumns: typeof value === "function" ? value(state.maxColumns) : value,
        })),
      filtersExpanded: false,
      setFiltersExpanded: (value) => set({ filtersExpanded: value }),
      showOwnedCount: false,
      setShowOwnedCount: (value) => set({ showOwnedCount: value }),

      physicalMax: 8,
      physicalMin: 1,
      autoColumns: 5,
      setPhysicalMax: (value) => set({ physicalMax: value }),
      setPhysicalMin: (value) => set({ physicalMin: value }),
      setAutoColumns: (value) => set({ autoColumns: value }),
    }),
    {
      name: "user-preferences",
      partialize: (state) => ({
        overrides: state.overrides,
        maxColumns: state.maxColumns,
        filtersExpanded: state.filtersExpanded,
        showOwnedCount: state.showOwnedCount,
      }),
      merge: (persisted, current) => {
        const safe = sanitizeOverrides(persisted);
        return {
          ...current,
          overrides: safe.overrides,
          ...resolveAll(safe.overrides),
          maxColumns: safe.maxColumns ?? current.maxColumns,
          filtersExpanded:
            typeof (persisted as Record<string, unknown>)?.filtersExpanded === "boolean"
              ? ((persisted as Record<string, unknown>).filtersExpanded as boolean)
              : current.filtersExpanded,
          showOwnedCount:
            typeof (persisted as Record<string, unknown>)?.showOwnedCount === "boolean"
              ? ((persisted as Record<string, unknown>).showOwnedCount as boolean)
              : current.showOwnedCount,
        };
      },
    },
  ),
);

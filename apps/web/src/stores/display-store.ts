import type { CompletionScopePreference, DefaultCardView, Marketplace } from "@openrift/shared";
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
  completionScope: CompletionScopePreference | null;
  defaultCardView: DefaultCardView | null;
}

const NULL_OVERRIDES: DisplayOverrides = {
  showImages: null,
  fancyFan: null,
  foilEffect: null,
  cardTilt: null,
  marketplaceOrder: null,
  languages: null,
  completionScope: null,
  defaultCardView: null,
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
    completionScope: overrides.completionScope ?? { ...PREFERENCE_DEFAULTS.completionScope },
    defaultCardView: overrides.defaultCardView ?? PREFERENCE_DEFAULTS.defaultCardView,
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
  completionScope: CompletionScopePreference;
  defaultCardView: DefaultCardView;

  // Nullable overrides — persisted to localStorage and synced to DB
  overrides: DisplayOverrides;

  // True once server prefs have been merged (or we know none exist). Consumers
  // that depend on authoritative prefs (e.g. seeding URL filters on mount) can
  // wait on this rather than reading potentially-stale localStorage values.
  prefsHydrated: boolean;
  markPrefsHydrated: () => void;

  // Setters (explicitly set a preference)
  setShowImages: (value: boolean) => void;
  setFancyFan: (value: boolean) => void;
  setFoilEffect: (value: boolean) => void;
  setCardTilt: (value: boolean) => void;
  setMarketplaceOrder: (value: Marketplace[]) => void;
  setLanguages: (value: string[]) => void;
  setCompletionScope: (value: CompletionScopePreference) => void;
  setDefaultCardView: (value: DefaultCardView) => void;

  // Reset a top-level preference to its default
  resetPreference: (
    key:
      | "showImages"
      | "fancyFan"
      | "foilEffect"
      | "cardTilt"
      | "marketplaceOrder"
      | "languages"
      | "completionScope"
      | "defaultCardView",
  ) => void;

  // Hydrate overrides from server data (used by sync hook)
  hydrateOverrides: (incoming: Partial<DisplayOverrides>) => void;

  // Device-local — not synced
  maxColumns: number | null;
  setMaxColumns: (value: number | null | ((prev: number | null) => number | null)) => void;
  filtersExpanded: boolean;
  setFiltersExpanded: (value: boolean) => void;
  catalogMode: "off" | "count" | "add";
  cycleCatalogMode: () => void;

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

      resetPreference: (key) =>
        set((state) => {
          const newOverrides = { ...state.overrides, [key]: null };
          return { [key]: resolveAll(newOverrides)[key], overrides: newOverrides };
        }),

      hydrateOverrides: (incoming) =>
        set((state) => {
          // Merge: only overwrite fields the server explicitly provided.
          // Undefined fields keep the existing localStorage value.
          const merged: DisplayOverrides = {
            showImages:
              incoming.showImages === undefined ? state.overrides.showImages : incoming.showImages,
            fancyFan:
              incoming.fancyFan === undefined ? state.overrides.fancyFan : incoming.fancyFan,
            foilEffect:
              incoming.foilEffect === undefined ? state.overrides.foilEffect : incoming.foilEffect,
            cardTilt:
              incoming.cardTilt === undefined ? state.overrides.cardTilt : incoming.cardTilt,
            marketplaceOrder:
              incoming.marketplaceOrder === undefined
                ? state.overrides.marketplaceOrder
                : incoming.marketplaceOrder,
            languages:
              incoming.languages === undefined ? state.overrides.languages : incoming.languages,
            completionScope:
              incoming.completionScope === undefined
                ? state.overrides.completionScope
                : incoming.completionScope,
            defaultCardView:
              incoming.defaultCardView === undefined
                ? state.overrides.defaultCardView
                : incoming.defaultCardView,
          };
          return { overrides: merged, ...resolveAll(merged), prefsHydrated: true };
        }),

      maxColumns: null,
      setMaxColumns: (value) =>
        set((state) => ({
          maxColumns: typeof value === "function" ? value(state.maxColumns) : value,
        })),
      filtersExpanded: false,
      setFiltersExpanded: (value) => set({ filtersExpanded: value }),
      catalogMode: "off" as const,
      cycleCatalogMode: () =>
        set((state) => {
          const next = { off: "count", count: "add", add: "off" } as const;
          return { catalogMode: next[state.catalogMode] };
        }),

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
        catalogMode: state.catalogMode,
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
          catalogMode: (() => {
            const raw = (persisted as Record<string, unknown>)?.catalogMode;
            if (raw === "off" || raw === "count" || raw === "add") {
              return raw;
            }
            // Migrate old boolean showOwnedCount
            const legacy = (persisted as Record<string, unknown>)?.showOwnedCount;
            if (legacy === true) {
              return "count";
            }
            return current.catalogMode;
          })(),
        };
      },
    },
  ),
);

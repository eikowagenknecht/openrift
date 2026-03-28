import type { FoilEffect, Marketplace } from "@openrift/shared";
import { ALL_MARKETPLACES } from "@openrift/shared";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { VisibleFields } from "@/lib/card-fields";
import { DEFAULT_VISIBLE_FIELDS } from "@/lib/card-fields";
import { sanitizePreferences } from "@/lib/sanitize-preferences";

interface DisplayState {
  showImages: boolean;
  setShowImages: (value: boolean) => void;
  fancyFan: boolean;
  setFancyFan: (value: boolean) => void;
  foilEffect: FoilEffect;
  setFoilEffect: (value: FoilEffect) => void;
  cardTilt: boolean;
  setCardTilt: (value: boolean) => void;
  visibleFields: VisibleFields;
  setVisibleFields: (value: VisibleFields | ((prev: VisibleFields) => VisibleFields)) => void;
  marketplaceOrder: Marketplace[];
  setMarketplaceOrder: (value: Marketplace[]) => void;
  maxColumns: number | null;
  setMaxColumns: (value: number | null | ((prev: number | null) => number | null)) => void;
  // Column measurement state (derived from viewport, not persisted)
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
      // User preferences (localStorage + synced to DB for logged-in users)
      showImages: true,
      fancyFan: true,
      foilEffect: "animated" as FoilEffect,
      cardTilt: true,
      visibleFields: DEFAULT_VISIBLE_FIELDS,
      marketplaceOrder: [...ALL_MARKETPLACES],
      setShowImages: (value) => set({ showImages: value }),
      setFancyFan: (value) => set({ fancyFan: value }),
      setFoilEffect: (value) => set({ foilEffect: value }),
      setCardTilt: (value) => set({ cardTilt: value }),
      setVisibleFields: (value) =>
        set((state) => ({
          visibleFields: typeof value === "function" ? value(state.visibleFields) : value,
        })),
      setMarketplaceOrder: (value) => set({ marketplaceOrder: value }),

      // localStorage only — intentionally not synced to DB (per-device setting)
      maxColumns: null,
      setMaxColumns: (value) =>
        set((state) => ({
          maxColumns: typeof value === "function" ? value(state.maxColumns) : value,
        })),

      // Layout state (derived from viewport by useResponsiveColumns, not persisted)
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
        showImages: state.showImages,
        fancyFan: state.fancyFan,
        foilEffect: state.foilEffect,
        cardTilt: state.cardTilt,
        visibleFields: state.visibleFields,
        marketplaceOrder: state.marketplaceOrder,
        maxColumns: state.maxColumns,
      }),
      merge: (persisted, current) => {
        const safe = sanitizePreferences(persisted);
        if (!safe) {
          return current;
        }
        return {
          ...current,
          showImages: safe.showImages,
          fancyFan: safe.fancyFan,
          foilEffect: safe.foilEffect,
          cardTilt: safe.cardTilt,
          visibleFields: safe.visibleFields,
          marketplaceOrder: safe.marketplaceOrder,
          maxColumns: safe.maxColumns ?? current.maxColumns,
        };
      },
    },
  ),
);

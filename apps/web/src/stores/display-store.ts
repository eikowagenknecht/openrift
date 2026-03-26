import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { VisibleFields } from "@/lib/card-fields";
import { DEFAULT_VISIBLE_FIELDS } from "@/lib/card-fields";

interface DisplayState {
  showImages: boolean;
  setShowImages: (value: boolean) => void;
  richEffects: boolean;
  setRichEffects: (value: boolean) => void;
  visibleFields: VisibleFields;
  setVisibleFields: (value: VisibleFields | ((prev: VisibleFields) => VisibleFields)) => void;
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
      richEffects: true,
      visibleFields: DEFAULT_VISIBLE_FIELDS,
      setShowImages: (value) => set({ showImages: value }),
      setRichEffects: (value) => set({ richEffects: value }),
      setVisibleFields: (value) =>
        set((state) => ({
          visibleFields: typeof value === "function" ? value(state.visibleFields) : value,
        })),

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
        richEffects: state.richEffects,
        visibleFields: state.visibleFields,
        maxColumns: state.maxColumns,
      }),
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as Partial<DisplayState>),
        visibleFields: {
          ...DEFAULT_VISIBLE_FIELDS,
          ...(persisted as Partial<DisplayState>)?.visibleFields,
        },
      }),
    },
  ),
);

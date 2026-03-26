import { create } from "zustand";

import type { CardFields } from "@/lib/card-fields";
import { DEFAULT_CARD_FIELDS } from "@/lib/card-fields";

interface DisplayState {
  showImages: boolean;
  setShowImages: (value: boolean) => void;
  richEffects: boolean;
  setRichEffects: (value: boolean) => void;
  cardFields: CardFields;
  setCardFields: (value: CardFields | ((prev: CardFields) => CardFields)) => void;
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

export const useDisplayStore = create<DisplayState>()((set) => ({
  showImages: true,
  richEffects: true,
  cardFields: DEFAULT_CARD_FIELDS,
  maxColumns: null,
  physicalMax: 8,
  physicalMin: 1,
  autoColumns: 5,
  setShowImages: (value) => set({ showImages: value }),
  setRichEffects: (value) => set({ richEffects: value }),
  setCardFields: (value) =>
    set((state) => ({
      cardFields: typeof value === "function" ? value(state.cardFields) : value,
    })),
  setMaxColumns: (value) =>
    set((state) => ({
      maxColumns: typeof value === "function" ? value(state.maxColumns) : value,
    })),
  setPhysicalMax: (value) => set({ physicalMax: value }),
  setPhysicalMin: (value) => set({ physicalMin: value }),
  setAutoColumns: (value) => set({ autoColumns: value }),
}));

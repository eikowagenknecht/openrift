import { create } from "zustand";

import type { CardFields } from "@/lib/card-fields";
import { DEFAULT_CARD_FIELDS } from "@/lib/card-fields";
import { PREFERENCES_CACHE_KEY } from "@/lib/preferences-cache";

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

// Read cached preferences at module load to avoid flash of defaults
function getInitialValues(): { showImages: boolean; richEffects: boolean; cardFields: CardFields } {
  try {
    const raw = localStorage.getItem(PREFERENCES_CACHE_KEY);
    if (raw) {
      const cached = JSON.parse(raw);
      return {
        showImages: cached.showImages ?? true,
        richEffects: cached.richEffects ?? true,
        cardFields: { ...DEFAULT_CARD_FIELDS, ...cached.cardFields },
      };
    }
  } catch {
    // Ignore corrupt cache
  }
  return { showImages: true, richEffects: true, cardFields: DEFAULT_CARD_FIELDS };
}

const initial = getInitialValues();

export const useDisplayStore = create<DisplayState>()((set) => ({
  showImages: initial.showImages,
  richEffects: initial.richEffects,
  cardFields: initial.cardFields,
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

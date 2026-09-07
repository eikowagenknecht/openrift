import type { Palette } from "@openrift/shared/types/api/preferences";
import { PALETTES, PREFERENCE_DEFAULTS } from "@openrift/shared/types/api/preferences";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { cookieStorage } from "@/lib/cookie-storage";

interface PaletteState {
  preference: Palette | null;
  palette: Palette;
  setPalette: (value: Palette | null) => void;
  reset: () => void;
}

function isPalette(value: unknown): value is Palette {
  return typeof value === "string" && (PALETTES as readonly string[]).includes(value);
}

function resolvePalette(preference: Palette | null): Palette {
  return preference ?? PREFERENCE_DEFAULTS.palette;
}

function applyPalette(palette: Palette) {
  document.documentElement.dataset.palette = palette;
}

export const usePaletteStore = create<PaletteState>()(
  persist(
    (set) => ({
      preference: null,
      palette: resolvePalette(null),
      setPalette: (value) => {
        const resolved = resolvePalette(value);
        applyPalette(resolved);
        set({ preference: value, palette: resolved });
      },
      reset: () => {
        const resolved = resolvePalette(null);
        applyPalette(resolved);
        set({ preference: null, palette: resolved });
      },
    }),
    {
      name: "palette",
      storage: cookieStorage,
      partialize: (state) => ({ preference: state.preference }),
      onRehydrateStorage: () => (state) => {
        if (typeof document !== "undefined" && state && cookieStorage) {
          cookieStorage.setItem("palette", { state: { preference: state.preference } });
        }
      },
      merge: (persisted, current) => {
        const record =
          typeof persisted === "object" && persisted !== null
            ? (persisted as Record<string, unknown>)
            : {};
        const raw = record.preference;
        const preference = isPalette(raw) ? raw : null;
        return {
          ...current,
          preference,
          palette: resolvePalette(preference),
        };
      },
    },
  ),
);

if (typeof document !== "undefined") {
  usePaletteStore.subscribe((state) => applyPalette(state.palette));
  applyPalette(usePaletteStore.getState().palette);
}

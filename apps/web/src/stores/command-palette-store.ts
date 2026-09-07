import { create } from "zustand";

import type { QuickAddVerb } from "@/lib/command-palette-results";

/**
 * Only labels and the open flag live here; the body stays mounted at the
 * route so its data plumbing (owned counts, deck contents) stays local.
 */
interface RegisteredQuickAdd {
  key: string;
  label: string;
  moveLabel: string | null;
  claimsShortcut: boolean;
}

interface CommandPaletteState {
  open: boolean;
  quickAddOpen: boolean;
  quickAddVerb: QuickAddVerb;
  quickAdd: RegisteredQuickAdd | null;
  query: string;
  highlighted: string;

  openPalette: () => void;
  closePalette: () => void;
  hidePalette: () => void;
  setQuery: (query: string) => void;
  setHighlighted: (value: string) => void;
  openQuickAdd: (verb: QuickAddVerb) => void;
  setQuickAddOpen: (open: boolean) => void;
  toggleShortcut: () => void;
  exitQuickAddScope: () => void;
  registerQuickAdd: (quickAdd: RegisteredQuickAdd) => void;
  unregisterQuickAdd: (key: string) => void;
}

const BLANK = { query: "", highlighted: "" };

export const useCommandPaletteStore = create<CommandPaletteState>()((set) => ({
  open: false,
  quickAddOpen: false,
  quickAddVerb: "add",
  quickAdd: null,
  query: "",
  highlighted: "",

  openPalette: () => set({ open: true, quickAddOpen: false }),
  closePalette: () => set({ open: false, ...BLANK }),
  hidePalette: () => set({ open: false }),
  setQuery: (query) => set({ query }),
  setHighlighted: (highlighted) => set({ highlighted }),

  openQuickAdd: (verb) => set({ quickAddOpen: true, quickAddVerb: verb, open: false, ...BLANK }),
  setQuickAddOpen: (open) => set({ quickAddOpen: open }),

  toggleShortcut: () =>
    set((state) => {
      if (state.open) {
        return { open: false, ...BLANK };
      }
      if (state.quickAdd?.claimsShortcut) {
        return {
          quickAddOpen: !state.quickAddOpen,
          quickAddVerb: "add" as const,
          open: false,
          ...BLANK,
        };
      }
      if (state.quickAddOpen) {
        return { quickAddOpen: false };
      }
      return { open: true, quickAddOpen: false };
    }),

  exitQuickAddScope: () => set({ quickAddOpen: false, open: true }),

  registerQuickAdd: (quickAdd) => set({ quickAdd }),

  // Keyed: a route unmounting after its successor registered must not wipe
  // the newcomer's entry.
  unregisterQuickAdd: (key) =>
    set((state) => (state.quickAdd?.key === key ? { quickAdd: null, quickAddOpen: false } : state)),
}));

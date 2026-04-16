import type { DeckZone } from "@openrift/shared";
import { create } from "zustand";

import type { DeckBuilderCard } from "@/lib/deck-builder-card";

interface DeckBuilderUiState {
  activeZone: DeckZone | null;
  runesByDomain: Map<string, DeckBuilderCard[]>;

  setActiveZone: (zone: DeckZone | null) => void;
  setRunesByDomain: (runesByDomain: Map<string, DeckBuilderCard[]>) => void;
  reset: () => void;
}

export const useDeckBuilderUiStore = create<DeckBuilderUiState>()((set) => ({
  activeZone: null,
  runesByDomain: new Map(),
  setActiveZone: (zone) => set({ activeZone: zone }),
  setRunesByDomain: (runesByDomain) => set({ runesByDomain }),
  reset: () => set({ activeZone: null, runesByDomain: new Map() }),
}));

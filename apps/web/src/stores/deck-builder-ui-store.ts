import type { DeckZone } from "@openrift/shared";
import { create } from "zustand";

import type { DeckBuilderCard } from "@/lib/deck-builder-card";

interface DeckBuilderUiState {
  activeZone: DeckZone | null;
  runesByDomain: Map<string, DeckBuilderCard[]>;
  /** When true, the main panel shows the deck Plan (ADR-029) instead of the card browser. */
  planActive: boolean;

  setActiveZone: (zone: DeckZone | null) => void;
  setRunesByDomain: (runesByDomain: Map<string, DeckBuilderCard[]>) => void;
  setPlanActive: (planActive: boolean) => void;
  reset: () => void;
}

export const useDeckBuilderUiStore = create<DeckBuilderUiState>()((set) => ({
  activeZone: null,
  runesByDomain: new Map(),
  planActive: false,
  setActiveZone: (zone) => set({ activeZone: zone }),
  setRunesByDomain: (runesByDomain) => set({ runesByDomain }),
  setPlanActive: (planActive) => set({ planActive }),
  reset: () => set({ activeZone: null, runesByDomain: new Map(), planActive: false }),
}));

import type { DeckZone } from "@openrift/shared";
import { create } from "zustand";

import type { DeckBuilderCard } from "@/lib/deck-builder-card";

/**
 * The deck overview dashboard's tabs: Deck | Test | Plan. The deck's charts
 * live inside the Deck tab (clicking a bar dims the grid right below it), so
 * there is no separate Stats tab.
 */
export type DeckOverviewTab = "overview" | "plan" | "test";

interface DeckBuilderUiState {
  activeZone: DeckZone | null;
  runesByDomain: Map<string, DeckBuilderCard[]>;
  /**
   * Which overview tab is showing. Lifted out of the overview component so the
   * sidebar's Plan entry can open the Plan tab (which hosts the plan editor,
   * ADR-029) without the main area having a second plan surface of its own.
   */
  overviewTab: DeckOverviewTab;

  setActiveZone: (zone: DeckZone | null) => void;
  setRunesByDomain: (runesByDomain: Map<string, DeckBuilderCard[]>) => void;
  setOverviewTab: (tab: DeckOverviewTab) => void;
  reset: () => void;
}

export const useDeckBuilderUiStore = create<DeckBuilderUiState>()((set) => ({
  activeZone: null,
  runesByDomain: new Map(),
  overviewTab: "overview",
  setActiveZone: (zone) => set({ activeZone: zone }),
  setRunesByDomain: (runesByDomain) => set({ runesByDomain }),
  setOverviewTab: (tab) => set({ overviewTab: tab }),
  reset: () => set({ activeZone: null, runesByDomain: new Map(), overviewTab: "overview" }),
}));

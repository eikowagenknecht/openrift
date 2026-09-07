import type { DeckZone } from "@openrift/shared/types/enums";
import { create } from "zustand";

import type { DeckBuilderCard } from "@/lib/deck-builder-card";

export type DeckOverviewTab = "overview" | "plan" | "test" | "box";

export type StatsLens = "types" | "rarity" | "ownership";

/**
 * The deck's zones plus the derived Tokens band, which is not a zone (a
 * token can't be a deck entry) but folds the same way in the overview grid.
 */
export type CollapsibleDeckSection = DeckZone | "tokens";

interface DeckBuilderUiState {
  activeZone: DeckZone | null;
  runesByDomain: Map<string, DeckBuilderCard[]>;
  overviewTab: DeckOverviewTab;
  collapsedZones: ReadonlySet<CollapsibleDeckSection>;
  statsLens: StatsLens;

  setActiveZone: (zone: DeckZone | null) => void;
  setRunesByDomain: (runesByDomain: Map<string, DeckBuilderCard[]>) => void;
  setOverviewTab: (tab: DeckOverviewTab) => void;
  toggleZoneCollapsed: (zone: CollapsibleDeckSection) => void;
  setStatsLens: (lens: StatsLens) => void;
  reset: () => void;
}

export const useDeckBuilderUiStore = create<DeckBuilderUiState>()((set) => ({
  activeZone: null,
  runesByDomain: new Map(),
  overviewTab: "overview",
  collapsedZones: new Set<CollapsibleDeckSection>(),
  statsLens: "types",
  setActiveZone: (zone) => set({ activeZone: zone }),
  setRunesByDomain: (runesByDomain) => set({ runesByDomain }),
  setOverviewTab: (tab) => set({ overviewTab: tab }),
  toggleZoneCollapsed: (zone) =>
    set((state) => {
      const next = new Set(state.collapsedZones);
      if (next.has(zone)) {
        next.delete(zone);
      } else {
        next.add(zone);
      }
      return { collapsedZones: next };
    }),
  setStatsLens: (lens) => set({ statsLens: lens }),
  reset: () =>
    set({
      activeZone: null,
      runesByDomain: new Map(),
      overviewTab: "overview",
      collapsedZones: new Set<CollapsibleDeckSection>(),
      statsLens: "types",
    }),
}));

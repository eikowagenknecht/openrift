import type { DeckZone } from "@openrift/shared";
import { create } from "zustand";

import type { DeckBuilderCard } from "@/lib/deck-builder-card";

/**
 * The deck overview dashboard's tabs: Deck | Test | Plan | Box. The deck's
 * charts live inside the Deck tab (clicking a bar dims the grid right below
 * it), so there is no separate Stats tab. Box only appears once the deck names
 * the collection it is stored in.
 */
export type DeckOverviewTab = "overview" | "plan" | "test" | "box";

/** Which chart the stats band's third slot shows when space is tight. */
export type StatsLens = "types" | "rarity" | "ownership";

/**
 * A section of the overview grid that folds to its header row. The deck's zones
 * plus the derived Tokens band, which is not a zone (a token can't be a deck
 * entry) but carries the same header and folds the same way.
 */
export type CollapsibleDeckSection = DeckZone | "tokens";

interface DeckBuilderUiState {
  activeZone: DeckZone | null;
  runesByDomain: Map<string, DeckBuilderCard[]>;
  /**
   * Which overview tab is showing. Lifted out of the overview component so the
   * sidebar's Plan entry can open the Plan tab (which hosts the plan editor,
   * ADR-029) without the main area having a second plan surface of its own.
   */
  overviewTab: DeckOverviewTab;
  /**
   * Sections the overview grid renders collapsed to their header row. Session
   * state, lifted out of the overview so a trip into a zone browser (which
   * unmounts the overview) doesn't reopen everything.
   */
  collapsedZones: ReadonlySet<CollapsibleDeckSection>;
  /**
   * The stats band's third-slot chart while the band is too narrow to show
   * all five charts side by side. Session state, same reasoning as
   * `collapsedZones`.
   */
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

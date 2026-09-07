import type { OverlayPlateFields, StageGround } from "@openrift/shared";
import { create } from "zustand";

import type { TierQueueDirection } from "@/lib/tier-list-presentation";

export const MIN_CARD_SCALE = 0.4;
export const MAX_CARD_SCALE = 1;

export function clampCardScale(scale: number): number {
  if (!Number.isFinite(scale)) {
    return MAX_CARD_SCALE;
  }
  return Math.min(MAX_CARD_SCALE, Math.max(MIN_CARD_SCALE, scale));
}

interface PresentationState {
  showText: boolean;
  plateFields: OverlayPlateFields;
  showStrip: boolean;
  showHelp: boolean;
  cardScale: number;
  ground: StageGround;
  boardMode: boolean;
  showHero: boolean;
  showRank: boolean;
  reveal: boolean;
  direction: TierQueueDirection;
  toggleText: () => void;
  togglePlateField: (key: keyof OverlayPlateFields) => void;
  toggleStrip: () => void;
  toggleHelp: () => void;
  closeHelp: () => void;
  setCardScale: (scale: number) => void;
  setGround: (ground: StageGround) => void;
  toggleBoard: () => void;
  toggleHero: () => void;
  toggleRank: () => void;
  toggleReveal: () => void;
  toggleDirection: () => void;
}

// Deliberately not persisted: a toggle silently restored from a session weeks
// ago could put a text panel on stream that nobody asked for.
export const usePresentationStore = create<PresentationState>()((set) => ({
  showText: false,
  plateFields: { name: true, code: true, stats: true, rulesText: true, flavorText: true },
  showStrip: false,
  showHelp: false,
  cardScale: MAX_CARD_SCALE,
  ground: "black",
  boardMode: true,
  showHero: true,
  showRank: true,
  reveal: false,
  direction: "best-first",
  toggleText: () => set((state) => ({ showText: !state.showText })),
  togglePlateField: (key) =>
    set((state) => ({ plateFields: { ...state.plateFields, [key]: !state.plateFields[key] } })),
  toggleStrip: () => set((state) => ({ showStrip: !state.showStrip })),
  toggleHelp: () => set((state) => ({ showHelp: !state.showHelp })),
  closeHelp: () => set({ showHelp: false }),
  setCardScale: (scale) => set({ cardScale: clampCardScale(scale) }),
  setGround: (ground) => set({ ground }),
  toggleBoard: () => set((state) => ({ boardMode: !state.boardMode })),
  toggleHero: () => set((state) => ({ showHero: !state.showHero })),
  toggleRank: () => set((state) => ({ showRank: !state.showRank })),
  toggleReveal: () => set((state) => ({ reveal: !state.reveal })),
  toggleDirection: () =>
    set((state) => ({
      direction: state.direction === "best-first" ? "worst-first" : "best-first",
    })),
}));

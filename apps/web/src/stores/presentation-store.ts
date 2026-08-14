import { create } from "zustand";

/** Smallest and largest share of the stage height the card may take. */
export const MIN_CARD_SCALE = 0.4;
export const MAX_CARD_SCALE = 1;

/**
 * Clamps a card scale into the supported range, so a bad value from a control
 * (or a future persisted blob) can't shrink the card to nothing.
 *
 * @returns The scale, clamped.
 */
export function clampCardScale(scale: number): number {
  if (!Number.isFinite(scale)) {
    return MAX_CARD_SCALE;
  }
  return Math.min(MAX_CARD_SCALE, Math.max(MIN_CARD_SCALE, scale));
}

interface PresentationState {
  /** Rules-text panel beside the card. Off by default: the card is the point. */
  showText: boolean;
  /** Thumbnail strip along the bottom showing the rest of the queue. */
  showStrip: boolean;
  /** Key-help overlay, opened with `?`. */
  showHelp: boolean;
  /** Card height as a share of the stage, so a capture can be framed to taste. */
  cardScale: number;
  toggleText: () => void;
  toggleStrip: () => void;
  toggleHelp: () => void;
  closeHelp: () => void;
  setCardScale: (scale: number) => void;
}

/**
 * Layer toggles for presentation mode.
 *
 * Deliberately not persisted. A creator sets these up seconds before recording
 * against whatever they are about to show, and a toggle silently restored from
 * a session three weeks ago would put a text panel on stream that nobody asked
 * for. The URL carries what is being presented; this carries only how the
 * current run is dressed.
 */
export const usePresentationStore = create<PresentationState>()((set) => ({
  showText: false,
  showStrip: false,
  showHelp: false,
  cardScale: MAX_CARD_SCALE,
  toggleText: () => set((state) => ({ showText: !state.showText })),
  toggleStrip: () => set((state) => ({ showStrip: !state.showStrip })),
  toggleHelp: () => set((state) => ({ showHelp: !state.showHelp })),
  closeHelp: () => set({ showHelp: false }),
  setCardScale: (scale) => set({ cardScale: clampCardScale(scale) }),
}));

import type { OverlayPlateFields, StageGround } from "@openrift/shared";
import { create } from "zustand";

import type { TierQueueDirection } from "@/lib/tier-list-presentation";

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
  /**
   * Which lines the text panel carries. All of them to start with — a creator
   * who turns the panel on wants to see the card written out, and pares it back
   * from there. Shares its shape with the stream overlay's plate, because the
   * two surfaces render the same component.
   */
  plateFields: OverlayPlateFields;
  /** Thumbnail strip along the bottom showing the rest of the queue. */
  showStrip: boolean;
  /** Key-help overlay, opened with `?`. */
  showHelp: boolean;
  /** Card height as a share of the stage, so a capture can be framed to taste. */
  cardScale: number;
  /**
   * What the card sits against. Black is the stage as it reads on camera; the
   * two chroma colours are there to be keyed out, so the card can be composited
   * over a scene in OBS instead of over a black rectangle.
   */
  ground: StageGround;
  /**
   * Show the whole board instead of one card at a time. Only a source that has
   * a board (a tier list) offers it; everything else ignores it.
   */
  boardMode: boolean;
  /**
   * The current card, drawn large beside the board. Independent of
   * {@link PresentationState.showText}: the card and its rules text are two
   * things a creator frames separately, and turning the text off must not take
   * the artwork with it. A reveal shows it regardless — the card waiting to be
   * placed is what the reveal *is*.
   */
  showHero: boolean;
  /**
   * Fill the board as the run goes rather than showing it complete. The card at
   * the current stop waits on the stage instead of sitting in its tier, so
   * stepping forward is what drops it in — the beat a ranking video is built on.
   */
  reveal: boolean;
  /** Which end of the ladder the run starts at. */
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
  toggleReveal: () => void;
  toggleDirection: () => void;
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
  plateFields: { name: true, code: true, stats: true, rulesText: true, flavorText: true },
  showStrip: false,
  showHelp: false,
  cardScale: MAX_CARD_SCALE,
  ground: "black",
  boardMode: true,
  showHero: true,
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
  toggleReveal: () => set((state) => ({ reveal: !state.reveal })),
  toggleDirection: () =>
    set((state) => ({
      direction: state.direction === "best-first" ? "worst-first" : "best-first",
    })),
}));

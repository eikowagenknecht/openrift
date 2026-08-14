import { create } from "zustand";

interface PresentationState {
  /** Rules-text panel beside the card. Off by default: the card is the point. */
  showText: boolean;
  /** Thumbnail strip along the bottom showing the rest of the queue. */
  showStrip: boolean;
  /** Key-help overlay, opened with `?`. */
  showHelp: boolean;
  toggleText: () => void;
  toggleStrip: () => void;
  toggleHelp: () => void;
  closeHelp: () => void;
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
  toggleText: () => set((state) => ({ showText: !state.showText })),
  toggleStrip: () => set((state) => ({ showStrip: !state.showStrip })),
  toggleHelp: () => set((state) => ({ showHelp: !state.showHelp })),
  closeHelp: () => set({ showHelp: false }),
}));

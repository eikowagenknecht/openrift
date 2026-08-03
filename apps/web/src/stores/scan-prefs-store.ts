import { create } from "zustand";
import { persist } from "zustand/middleware";

/** The language scans resolve to when only the language is ambiguous. */
const DEFAULT_SCAN_LANGUAGE = "EN";

interface ScanPrefsState {
  /** Silence the lock tick (vibration is unaffected). */
  muted: boolean;
  setMuted: (value: boolean) => void;
  /** Last collection scans were added to; null until the first pick. */
  targetCollectionId: string | null;
  setTargetCollectionId: (value: string | null) => void;
  /**
   * The language the user's physical cards are in (a printing language code,
   * e.g. "EN"), or null for a mixed stack. A stated language wins over the
   * engine's own language read; null hands that decision back to the engine.
   */
  cardLanguage: string | null;
  setCardLanguage: (value: string | null) => void;
  /**
   * Keep counting copies of a card that stays in front of the lens, for
   * dealing a stack past a propped-up phone. Off by default: handheld, the
   * same card in shot would otherwise be added again and again.
   */
  autoScan: boolean;
  setAutoScan: (value: boolean) => void;
}

export const useScanPrefsStore = create<ScanPrefsState>()(
  persist(
    (set) => ({
      muted: false,
      setMuted: (value) => set({ muted: value }),
      targetCollectionId: null,
      setTargetCollectionId: (value) => set({ targetCollectionId: value }),
      cardLanguage: DEFAULT_SCAN_LANGUAGE,
      setCardLanguage: (value) => set({ cardLanguage: value }),
      autoScan: false,
      setAutoScan: (value) => set({ autoScan: value }),
    }),
    {
      name: "openrift-scan-prefs",
      partialize: (state) => ({
        muted: state.muted,
        targetCollectionId: state.targetCollectionId,
        cardLanguage: state.cardLanguage,
        autoScan: state.autoScan,
      }),
      merge: (persisted, current) => {
        const raw = (persisted as Record<string, unknown>) ?? {};
        // null is a stored value here ("any language"), not a missing one, so
        // it has to pass the shape check rather than fall back to the default.
        const language =
          typeof raw.cardLanguage === "string" || raw.cardLanguage === null
            ? raw.cardLanguage
            : current.cardLanguage;
        return {
          ...current,
          muted: typeof raw.muted === "boolean" ? raw.muted : current.muted,
          targetCollectionId:
            typeof raw.targetCollectionId === "string"
              ? raw.targetCollectionId
              : current.targetCollectionId,
          cardLanguage: language,
          autoScan: typeof raw.autoScan === "boolean" ? raw.autoScan : current.autoScan,
        };
      },
    },
  ),
);

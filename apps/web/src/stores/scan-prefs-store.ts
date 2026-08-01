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
  /** The language the user's physical cards are in (a printing language
   * code, e.g. "EN"); language-only ambiguities resolve to it silently. */
  cardLanguage: string;
  setCardLanguage: (value: string) => void;
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
    }),
    {
      name: "openrift-scan-prefs",
      partialize: (state) => ({
        muted: state.muted,
        targetCollectionId: state.targetCollectionId,
        cardLanguage: state.cardLanguage,
      }),
      merge: (persisted, current) => {
        const raw = (persisted as Record<string, unknown>) ?? {};
        return {
          ...current,
          muted: typeof raw.muted === "boolean" ? raw.muted : current.muted,
          targetCollectionId:
            typeof raw.targetCollectionId === "string"
              ? raw.targetCollectionId
              : current.targetCollectionId,
          cardLanguage:
            typeof raw.cardLanguage === "string" ? raw.cardLanguage : current.cardLanguage,
        };
      },
    },
  ),
);

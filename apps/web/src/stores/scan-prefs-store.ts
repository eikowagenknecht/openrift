import { create } from "zustand";
import { persist } from "zustand/middleware";

const DEFAULT_SCAN_LANGUAGE = "EN";

export const SCAN_IDENTIFY_ONLY = "identify-only";

interface ScanPrefsState {
  muted: boolean;
  setMuted: (value: boolean) => void;
  targetCollectionId: string | null;
  setTargetCollectionId: (value: string | null) => void;
  cardLanguage: string | null;
  setCardLanguage: (value: string | null) => void;
  autoScan: boolean;
  setAutoScan: (value: boolean) => void;
}

export const useScanPrefsStore = create<ScanPrefsState>()(
  persist(
    (set) => ({
      muted: false,
      setMuted: (value) => set({ muted: value }),
      targetCollectionId: SCAN_IDENTIFY_ONLY,
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
        // null is a stored value here ("any language"), not a missing one.
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

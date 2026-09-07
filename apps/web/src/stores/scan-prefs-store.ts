import { create } from "zustand";
import { persist } from "zustand/middleware";

const DEFAULT_SCAN_LANGUAGE = "EN";

const LEGACY_IDENTIFY_ONLY = "identify-only";

interface ScanPrefsState {
  muted: boolean;
  setMuted: (value: boolean) => void;
  destinationCollectionId: string | null;
  setDestinationCollectionId: (value: string | null) => void;
  cardLanguage: string | null;
  setCardLanguage: (value: string | null) => void;
  autoScan: boolean;
  setAutoScan: (value: boolean) => void;
  tapToScan: boolean;
  setTapToScan: (value: boolean) => void;
}

function mergeDestination(raw: Record<string, unknown>, current: string | null): string | null {
  if (typeof raw.destinationCollectionId === "string") {
    return raw.destinationCollectionId;
  }
  if (raw.destinationCollectionId === null) {
    return null;
  }
  const legacy = raw.targetCollectionId;
  if (typeof legacy === "string" && legacy !== LEGACY_IDENTIFY_ONLY) {
    return legacy;
  }
  return current;
}

export const useScanPrefsStore = create<ScanPrefsState>()(
  persist(
    (set) => ({
      muted: false,
      setMuted: (value) => set({ muted: value }),
      destinationCollectionId: null,
      setDestinationCollectionId: (value) => set({ destinationCollectionId: value }),
      cardLanguage: DEFAULT_SCAN_LANGUAGE,
      setCardLanguage: (value) => set({ cardLanguage: value }),
      autoScan: false,
      setAutoScan: (value) => set({ autoScan: value }),
      tapToScan: false,
      setTapToScan: (value) => set({ tapToScan: value }),
    }),
    {
      name: "openrift-scan-prefs",
      partialize: (state) => ({
        muted: state.muted,
        destinationCollectionId: state.destinationCollectionId,
        cardLanguage: state.cardLanguage,
        autoScan: state.autoScan,
        tapToScan: state.tapToScan,
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
          destinationCollectionId: mergeDestination(raw, current.destinationCollectionId),
          cardLanguage: language,
          autoScan: typeof raw.autoScan === "boolean" ? raw.autoScan : current.autoScan,
          tapToScan: typeof raw.tapToScan === "boolean" ? raw.tapToScan : current.tapToScan,
        };
      },
    },
  ),
);

import { create } from "zustand";
import { persist } from "zustand/middleware";

/** The language scans resolve to when only the language is ambiguous. */
const DEFAULT_SCAN_LANGUAGE = "EN";

/**
 * Target value for scanning without collecting: the card is recognised and
 * logged in the session tray, and nothing is written to the account. The
 * default, because naming cards is what a first-time scanner wants; the tray's
 * "Add all to a collection" turns a session into copies afterwards.
 */
export const SCAN_IDENTIFY_ONLY = "identify-only";

interface ScanPrefsState {
  /** Silence the lock tick (vibration is unaffected). */
  muted: boolean;
  setMuted: (value: boolean) => void;
  /**
   * Where scans go: a collection id collects live, {@link SCAN_IDENTIFY_ONLY}
   * only names them. Null no longer occurs as a fresh default, but blobs
   * persisted before identify-only became the default still carry it.
   */
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
        // null is a stored value here ("any language"), not a missing one, so
        // it has to pass the shape check rather than fall back to the default.
        const language =
          typeof raw.cardLanguage === "string" || raw.cardLanguage === null
            ? raw.cardLanguage
            : current.cardLanguage;
        return {
          ...current,
          muted: typeof raw.muted === "boolean" ? raw.muted : current.muted,
          // Only a stored string is a real pick, so a blob written before the
          // identify-only default (which stored null until the first pick)
          // lands on that default like a new user would.
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

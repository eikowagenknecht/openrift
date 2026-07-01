// Logged-out deck storage (ADR-035). Decks built without an account live here,
// in `localStorage`, keyed by a synthetic `local:` id — never on the server.
// This mirrors the fully-local match tracker (`match-tracker-store.ts`); the
// deck code is the only cross-device bridge. A logged-in user's decks always
// live on the server; this store only ever holds work done while logged out (or
// imported from a code while logged out), which the merged `/decks` list
// surfaces and offers to claim into the account.

import type { DeckFormat, DeckFormatConfig, DeckZone } from "@openrift/shared";
import { toast } from "sonner";
import { create } from "zustand";
import type { StateStorage } from "zustand/middleware";
import { createJSONStorage, persist } from "zustand/middleware";

import { randomUuid } from "@/lib/random-uuid";

/** Prefix that marks a deck id as browser-local (no server row). */
export const LOCAL_DECK_PREFIX = "local:";

/**
 * Whether a deck id refers to a browser-local deck. Gate the local builder /
 * persistence / list chrome on THIS, never on the absence of a `userId`: a
 * logged-in user's `userId` is briefly null during session load, so gating on
 * "no user" would misroute a real deck. A `local:` id is unambiguous.
 *
 * @returns True when the id is a browser-local deck id.
 */
export function isLocalDeckId(id: string): boolean {
  return id.startsWith(LOCAL_DECK_PREFIX);
}

/** A single card row in a local deck — same shape the server stores per card. */
export interface LocalDeckCard {
  zone: DeckZone;
  cardId: string;
  quantity: number;
  preferredPrintingId: string | null;
}

/** A browser-local deck. Mirrors the server deck-detail shape so claiming it
 *  into an account is a mechanical, lossless copy of everything v1 stores. */
export interface LocalDeck {
  id: string;
  name: string;
  description: string;
  format: DeckFormat;
  formatConfig: DeckFormatConfig | null;
  cards: LocalDeckCard[];
  createdAt: string;
  updatedAt: string;
}

/** Editable metadata fields of a local deck. A null `description` clears it. */
interface LocalDeckPatch {
  name?: string;
  description?: string | null;
  format?: DeckFormat;
  formatConfig?: DeckFormatConfig | null;
}

interface LocalDecksState {
  /** All local decks, keyed by their `local:` id. */
  decks: Record<string, LocalDeck>;
  /** Create a new empty local deck and return its id. */
  createDeck: (format: DeckFormat, name?: string) => string;
  /** Patch a deck's metadata (name / description / format / formatConfig). */
  updateDeck: (id: string, patch: LocalDeckPatch) => void;
  /** Replace a deck's full card set (the bulk write the draft autosave calls). */
  setCards: (id: string, cards: LocalDeckCard[]) => void;
  /** Delete a deck. */
  deleteDeck: (id: string) => void;
  /** Copy a deck (cards included) under a new id; returns it, or null if absent. */
  duplicateDeck: (id: string) => string | null;
  /** Remove decks that were claimed into the account. */
  clearImported: (ids: string[]) => void;
}

const QUOTA_MESSAGE =
  "Couldn't save your decks — this browser's storage is full. Sign in to sync your decks, or remove some local decks.";

function isQuotaExceeded(error: unknown): boolean {
  // Browsers throw a DOMException named "QuotaExceededError" (legacy code 22,
  // or 1014 "NS_ERROR_DOM_QUOTA_REACHED" on Firefox).
  return (
    error instanceof DOMException &&
    (error.name === "QuotaExceededError" ||
      error.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
      error.code === 22 ||
      error.code === 1014)
  );
}

/**
 * Write to a storage, turning a quota-exceeded failure into a user-facing toast
 * instead of a silent throw that would abort the whole `setState`. Other errors
 * still propagate. Exported so the quota path is unit-testable without driving
 * Zustand's async persist timing.
 *
 * @returns True when the value was written, false when storage was full.
 */
export function writeLocalDecksItem(
  storage: Pick<Storage, "setItem">,
  name: string,
  value: string,
): boolean {
  try {
    storage.setItem(name, value);
    return true;
  } catch (error) {
    if (isQuotaExceeded(error)) {
      toast.error(QUOTA_MESSAGE);
      return false;
    }
    throw error;
  }
}

// A localStorage-backed StateStorage whose writes degrade gracefully when the
// browser quota is hit. SSR has no localStorage, so fall back to a no-op store.
const quotaAwareStorage: StateStorage = {
  getItem: (name) => (typeof localStorage === "undefined" ? null : localStorage.getItem(name)),
  setItem: (name, value) => {
    if (typeof localStorage !== "undefined") {
      writeLocalDecksItem(localStorage, name, value);
    }
  },
  removeItem: (name) => {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(name);
    }
  },
};

function nowIso(): string {
  // Stamped inside actions (never at module scope) so persisted timestamps
  // reflect when the edit happened, not when the bundle loaded.
  return new Date().toISOString();
}

export const useLocalDecksStore = create<LocalDecksState>()(
  persist(
    (set, getState) => ({
      decks: {},

      createDeck: (format, name) => {
        const id = `${LOCAL_DECK_PREFIX}${randomUuid()}`;
        const stamp = nowIso();
        set((state) => ({
          decks: {
            ...state.decks,
            [id]: {
              id,
              name: name?.trim() || "New Deck",
              description: "",
              format,
              formatConfig: null,
              cards: [],
              createdAt: stamp,
              updatedAt: stamp,
            },
          },
        }));
        return id;
      },

      updateDeck: (id, patch) =>
        set((state) => {
          const existing = state.decks[id];
          if (!existing) {
            return state;
          }
          // Only apply keys the caller set (an explicit `undefined` must not
          // wipe a field); a null description clears it to "".
          const next: LocalDeck = { ...existing, updatedAt: nowIso() };
          if (patch.name !== undefined) {
            next.name = patch.name;
          }
          if (patch.description !== undefined) {
            next.description = patch.description ?? "";
          }
          if (patch.format !== undefined) {
            next.format = patch.format;
          }
          if (patch.formatConfig !== undefined) {
            next.formatConfig = patch.formatConfig;
          }
          return { decks: { ...state.decks, [id]: next } };
        }),

      setCards: (id, cards) =>
        set((state) => {
          const existing = state.decks[id];
          if (!existing) {
            return state;
          }
          return {
            decks: { ...state.decks, [id]: { ...existing, cards, updatedAt: nowIso() } },
          };
        }),

      deleteDeck: (id) =>
        set((state) => {
          if (!state.decks[id]) {
            return state;
          }
          const rest: Record<string, LocalDeck> = {};
          for (const [deckId, deck] of Object.entries(state.decks)) {
            if (deckId !== id) {
              rest[deckId] = deck;
            }
          }
          return { decks: rest };
        }),

      duplicateDeck: (id) => {
        const source = getState().decks[id];
        if (!source) {
          return null;
        }
        const newId = `${LOCAL_DECK_PREFIX}${randomUuid()}`;
        const stamp = nowIso();
        set((state) => ({
          decks: {
            ...state.decks,
            [newId]: {
              ...source,
              id: newId,
              name: `${source.name} (copy)`,
              cards: source.cards.map((card) => ({ ...card })),
              createdAt: stamp,
              updatedAt: stamp,
            },
          },
        }));
        return newId;
      },

      clearImported: (ids) =>
        set((state) => {
          const remove = new Set(ids);
          const rest: Record<string, LocalDeck> = {};
          for (const [deckId, deck] of Object.entries(state.decks)) {
            if (!remove.has(deckId)) {
              rest[deckId] = deck;
            }
          }
          return { decks: rest };
        }),
    }),
    {
      name: "openrift-local-decks",
      storage: createJSONStorage(() => quotaAwareStorage),
      partialize: (state) => ({ decks: state.decks }),
    },
  ),
);

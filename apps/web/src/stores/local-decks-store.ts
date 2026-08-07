// Logged-out deck storage (ADR-035). Decks built without an account live here,
// in `localStorage`, keyed by a synthetic `local:` id — never on the server.
// This mirrors the fully-local match tracker (`match-tracker-store.ts`); the
// deck code is the only cross-device bridge. A logged-in user's decks always
// live on the server; this store only ever holds work done while logged out (or
// imported from a code while logged out), which the merged `/decks` list
// surfaces and offers to claim into the account.

import type { DeckFormat, DeckFormatConfig, DeckZone } from "@openrift/shared";
import { WellKnown } from "@openrift/shared";
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
  /** Custom cover art (see the server's decks.cover_* columns). Null = legend. */
  coverCardId: string | null;
  coverPrintingId: string | null;
  coverPosition: number | null;
  createdAt: string;
  updatedAt: string;
}

/** Editable metadata fields of a local deck. A null `description` clears it. */
interface LocalDeckPatch {
  name?: string;
  description?: string | null;
  format?: DeckFormat;
  formatConfig?: DeckFormatConfig | null;
  coverCardId?: string | null;
  coverPrintingId?: string | null;
  coverPosition?: number | null;
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
  "Couldn't save your decks: this browser's storage is full. Sign in to sync your decks, or remove some local decks.";

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

function sanitizeCards(raw: unknown): LocalDeckCard[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const cards: LocalDeckCard[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const candidate = entry as Record<string, unknown>;
    // Zone stays an open string on purpose: a zone this bundle doesn't know
    // (written by a newer deploy) must survive the round-trip, not be dropped.
    if (typeof candidate.zone !== "string" || typeof candidate.cardId !== "string") {
      continue;
    }
    const quantity =
      typeof candidate.quantity === "number" && candidate.quantity >= 1
        ? Math.floor(candidate.quantity)
        : null;
    if (quantity === null) {
      continue;
    }
    cards.push({
      zone: candidate.zone as DeckZone,
      cardId: candidate.cardId,
      quantity,
      preferredPrintingId:
        typeof candidate.preferredPrintingId === "string" ? candidate.preferredPrintingId : null,
    });
  }
  return cards;
}

/**
 * Validate a persisted decks blob, keeping every salvageable deck and dropping
 * only what can't be trusted. These are anonymous users' ONLY copy of their
 * decks (ADR-035): a malformed entry (cross-version write from another tab,
 * hand edit, partial corruption that still parses as JSON) must degrade to the
 * valid subset instead of crashing /decks on rehydrate. Cosmetic fields
 * fall back to defaults; only entries without a usable identity are dropped.
 * @returns The valid decks keyed by their `local:` id; an untrusted blob yields {}.
 */
export function sanitizeDecks(raw: unknown): Record<string, LocalDeck> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  const decks: Record<string, LocalDeck> = {};
  for (const [id, entry] of Object.entries(raw)) {
    if (!isLocalDeckId(id) || !entry || typeof entry !== "object") {
      continue;
    }
    const candidate = entry as Record<string, unknown>;
    const fallbackStamp = nowIso();
    decks[id] = {
      id,
      name:
        typeof candidate.name === "string" && candidate.name.trim() !== ""
          ? candidate.name
          : "Recovered deck",
      description: typeof candidate.description === "string" ? candidate.description : "",
      // Open string on purpose — a format this bundle doesn't know must survive.
      format:
        typeof candidate.format === "string" ? candidate.format : WellKnown.deckFormat.CONSTRUCTED,
      formatConfig:
        candidate.formatConfig && typeof candidate.formatConfig === "object"
          ? (candidate.formatConfig as DeckFormatConfig)
          : null,
      cards: sanitizeCards(candidate.cards),
      coverCardId: typeof candidate.coverCardId === "string" ? candidate.coverCardId : null,
      coverPrintingId:
        typeof candidate.coverPrintingId === "string" ? candidate.coverPrintingId : null,
      coverPosition:
        typeof candidate.coverPosition === "number" &&
        Number.isInteger(candidate.coverPosition) &&
        candidate.coverPosition >= 0 &&
        candidate.coverPosition <= 100
          ? candidate.coverPosition
          : null,
      createdAt: typeof candidate.createdAt === "string" ? candidate.createdAt : fallbackStamp,
      updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : fallbackStamp,
    };
  }
  return decks;
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
              coverCardId: null,
              coverPrintingId: null,
              coverPosition: null,
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
          if (patch.coverCardId !== undefined) {
            next.coverCardId = patch.coverCardId;
          }
          if (patch.coverPrintingId !== undefined) {
            next.coverPrintingId = patch.coverPrintingId;
          }
          if (patch.coverPosition !== undefined) {
            next.coverPosition = patch.coverPosition;
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
      // No `version`: an explicit version would make an older cached bundle
      // (implicit version 0, no migrate) DISCARD the whole blob on mismatch —
      // the exact data loss this store must never cause. The sanitizing merge
      // below handles every shape drift instead.
      merge: (persisted, current) => {
        if (!persisted || typeof persisted !== "object") {
          return current;
        }
        const raw = persisted as { decks?: unknown };
        return { ...current, decks: sanitizeDecks(raw.decks) };
      },
    },
  ),
);

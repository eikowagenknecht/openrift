// Logged-out deck storage. Decks built without an account live in
// `localStorage`, keyed by a synthetic `local:` id, never on the server. The
// merged `/decks` list offers to claim them into the account once signed in.

import { isAllowedLinkUrl } from "@openrift/shared/link-hosts";
import type { DeckFormatConfig, DeckLink } from "@openrift/shared/types/api/deck";
import type { DeckFormat, DeckZone } from "@openrift/shared/types/enums";
import { WellKnown } from "@openrift/shared/well-known";
import { toast } from "sonner";
import { create } from "zustand";
import type { StateStorage } from "zustand/middleware";
import { createJSONStorage, persist } from "zustand/middleware";

import type { LocalDeck, LocalDeckCard } from "@/lib/local-deck";
import { isLocalDeckId, LOCAL_DECK_PREFIX } from "@/lib/local-deck";
import { randomUuid } from "@/lib/random-uuid";

interface LocalDeckPatch {
  name?: string;
  description?: string | null;
  format?: DeckFormat;
  formatConfig?: DeckFormatConfig | null;
  coverCardId?: string | null;
  coverPrintingId?: string | null;
  coverPosition?: number | null;
  links?: DeckLink[];
}

interface LocalDecksState {
  decks: Record<string, LocalDeck>;
  createDeck: (format: DeckFormat, name?: string) => string;
  updateDeck: (id: string, patch: LocalDeckPatch) => void;
  setCards: (id: string, cards: LocalDeckCard[]) => void;
  deleteDeck: (id: string) => void;
  duplicateDeck: (id: string) => string | null;
  clearImported: (ids: string[]) => void;
}

const QUOTA_MESSAGE =
  "Couldn't save your decks: this browser's storage is full. Sign in to sync your decks, or remove some local decks.";

function isQuotaExceeded(error: unknown): boolean {
  // Browsers throw a DOMException named "QuotaExceededError" (legacy code 22,
  // or 1014 "NS_ERROR_DOM_QUOTA_REACHED" on Firefox).
  return (
    error instanceof DOMException &&
    (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED")
  );
}

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

// SSR has no localStorage; fall back to a no-op store there.
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

// Blobs written before links existed carry a single `videoUrl` string
// instead; that becomes the first entry, since the store has no persist
// `version` to migrate through.
function sanitizeLinks(candidate: Record<string, unknown>): DeckLink[] {
  if (Array.isArray(candidate.links)) {
    const links: DeckLink[] = [];
    for (const entry of candidate.links) {
      if (!entry || typeof entry !== "object") {
        continue;
      }
      const link = entry as Record<string, unknown>;
      if (typeof link.url !== "string" || !isAllowedLinkUrl(link.url)) {
        continue;
      }
      links.push({
        url: link.url,
        ...(typeof link.title === "string" && link.title !== "" ? { title: link.title } : {}),
      });
    }
    return links;
  }
  if (typeof candidate.videoUrl === "string" && isAllowedLinkUrl(candidate.videoUrl)) {
    return [{ url: candidate.videoUrl, title: "Video guide" }];
  }
  return [];
}

// A malformed entry degrades to the valid subset; it does not crash /decks
// on rehydrate.
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
      links: sanitizeLinks(candidate),
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
              links: [],
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
          if (patch.links !== undefined) {
            next.links = patch.links;
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
      // No `version`: bumping it would discard a newer blob on mismatch.
      // `sanitizeDecks` handles shape drift instead.
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

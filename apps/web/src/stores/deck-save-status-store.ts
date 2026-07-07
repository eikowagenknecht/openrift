// Deck save status (ADR-027 decks vertical): a tiny state machine per
// (userId, deckId) driven by the offline-transaction lifecycle in
// deck-builder-synced.ts. "dirty" while edits sit in the uncommitted
// debounce window, "saving" while a committed transaction awaits server
// confirmation, "queued" once the write is durably parked in the outbox
// (offline or past the feedback window — safe to close the tab), "error"
// only on a permanent in-window failure (the optimistic rows rolled back).

import { create } from "zustand";

type DeckSaveState = "saved" | "dirty" | "saving" | "queued" | "error";

interface DeckSaveEntry {
  state: DeckSaveState;
  error: Error | null;
}

interface DeckSaveStatusStore {
  statuses: Record<string, DeckSaveEntry>;
  markDirty: (key: string) => void;
  markSaving: (key: string) => void;
  markSettled: (key: string, outcome: "synced" | "queued") => void;
  markError: (key: string, error: Error) => void;
}

/**
 * Builds the per-user status key, so one user's save state never bleeds into
 * another account's view of the same deck id.
 *
 * @returns The composite store key.
 */
export function deckSaveKey(userId: string, deckId: string): string {
  return `${userId}:${deckId}`;
}

export const useDeckSaveStatusStore = create<DeckSaveStatusStore>()((set) => ({
  statuses: {},

  markDirty: (key) =>
    set((state) => ({
      statuses: { ...state.statuses, [key]: { state: "dirty", error: null } },
    })),

  markSaving: (key) =>
    set((state) => ({
      statuses: { ...state.statuses, [key]: { state: "saving", error: null } },
    })),

  markSettled: (key, outcome) =>
    set((state) => ({
      statuses: {
        ...state.statuses,
        [key]: { state: outcome === "synced" ? "saved" : "queued", error: null },
      },
    })),

  markError: (key, error) =>
    set((state) => ({
      statuses: { ...state.statuses, [key]: { state: "error", error } },
    })),
}));

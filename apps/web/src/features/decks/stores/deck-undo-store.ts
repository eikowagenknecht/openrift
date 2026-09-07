import { create } from "zustand";

import type { DeckBuilderCard } from "@/features/decks/lib/deck-builder-card";

/**
 * Edits landing within this window of the previous record collapse into one
 * undo step, since the snapshot before the first of a burst already captures
 * the pre-burst deck.
 */
const BURST_MS = 500;

const MAX_DEPTH = 100;

/**
 * Snapshots are handed out to callers who feed them straight into the draft
 * collection, so every entry is copied on the way in and on the way out.
 */
function copySnapshot(cards: readonly DeckBuilderCard[]): DeckBuilderCard[] {
  return cards.map((card) => ({ ...card }));
}

interface DeckUndoState {
  deckId: string | null;
  past: DeckBuilderCard[][];
  future: DeckBuilderCard[][];
  lastRecordAt: number;
  record: (deckId: string, snapshot: readonly DeckBuilderCard[]) => void;
  undo: (deckId: string, currentCards: readonly DeckBuilderCard[]) => DeckBuilderCard[] | null;
  redo: (deckId: string, currentCards: readonly DeckBuilderCard[]) => DeckBuilderCard[] | null;
  reset: (deckId?: string) => void;
}

export const useDeckUndoStore = create<DeckUndoState>((set, get) => ({
  deckId: null,
  past: [],
  future: [],
  lastRecordAt: 0,

  record: (deckId, snapshot) => {
    const state = get();
    const now = Date.now();
    // A different deck's history is meaningless here.
    if (state.deckId !== deckId) {
      set({ deckId, past: [copySnapshot(snapshot)], future: [], lastRecordAt: now });
      return;
    }
    // Mid-burst: the step already on the stack is the pre-burst state, so keep
    // it and only drop the redo branch this edit invalidates.
    if (state.past.length > 0 && now - state.lastRecordAt < BURST_MS) {
      set({ future: [], lastRecordAt: now });
      return;
    }
    const past = [...state.past, copySnapshot(snapshot)];
    set({
      past: past.length > MAX_DEPTH ? past.slice(past.length - MAX_DEPTH) : past,
      future: [],
      lastRecordAt: now,
    });
  },

  undo: (deckId, currentCards) => {
    const state = get();
    if (state.deckId !== deckId || state.past.length === 0) {
      return null;
    }
    const restored = state.past.at(-1) ?? [];
    set({
      past: state.past.slice(0, -1),
      future: [...state.future, copySnapshot(currentCards)],
      // Restoring is a step of its own: the next edit must not coalesce into
      // whatever was recorded before it.
      lastRecordAt: 0,
    });
    return copySnapshot(restored);
  },

  redo: (deckId, currentCards) => {
    const state = get();
    if (state.deckId !== deckId || state.future.length === 0) {
      return null;
    }
    const restored = state.future.at(-1) ?? [];
    set({
      past: [...state.past, copySnapshot(currentCards)],
      future: state.future.slice(0, -1),
      lastRecordAt: 0,
    });
    return copySnapshot(restored);
  },

  reset: (deckId) => {
    set({ deckId: deckId ?? null, past: [], future: [], lastRecordAt: 0 });
  },
}));

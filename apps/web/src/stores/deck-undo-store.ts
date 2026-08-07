import { create } from "zustand";

import type { DeckBuilderCard } from "@/lib/deck-builder-card";

/**
 * Edits landing within this window of the previous record collapse into one
 * undo step. Holding a +/- button or shift-clicking a stack fires a burst of
 * mutations; the snapshot taken before the first of them already captures the
 * pre-burst deck, so the rest add nothing but noise to the stack.
 */
const BURST_MS = 500;

/** Depth of the undo stack; older steps fall off the bottom. */
const MAX_DEPTH = 100;

/**
 * Snapshots are handed out to callers who feed them straight into the draft
 * collection, so every entry is copied on the way in and on the way out.
 * @returns A row-wise copy of the snapshot.
 */
function copySnapshot(cards: readonly DeckBuilderCard[]): DeckBuilderCard[] {
  return cards.map((card) => ({ ...card }));
}

interface DeckUndoState {
  /** The deck the stacks belong to; switching decks clears them. */
  deckId: string | null;
  past: DeckBuilderCard[][];
  future: DeckBuilderCard[][];
  /** Timestamp of the last accepted record, for burst coalescing. */
  lastRecordAt: number;
  /** Snapshot the deck as it looked *before* the edit about to be applied. */
  record: (deckId: string, snapshot: readonly DeckBuilderCard[]) => void;
  /** @returns The deck state to restore, or null when there's nothing to undo. */
  undo: (deckId: string, currentCards: readonly DeckBuilderCard[]) => DeckBuilderCard[] | null;
  /** @returns The deck state to restore, or null when there's nothing to redo. */
  redo: (deckId: string, currentCards: readonly DeckBuilderCard[]) => DeckBuilderCard[] | null;
  /** Drops both stacks, e.g. when server state replaces the draft. */
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

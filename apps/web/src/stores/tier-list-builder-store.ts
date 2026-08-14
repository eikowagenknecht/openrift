import type { TierRow } from "@openrift/shared";
import { MAX_TIER_ROWS } from "@openrift/shared/contracts/tier-lists";
import { create } from "zustand";

/**
 * Working state for the tier-list builder: the board being edited, plus a
 * `dirty` flag so the page can show and gate a save.
 *
 * The board lives here rather than in react-query's cache because it changes on
 * every drag, and a query cache is the wrong place for state that mutates dozens
 * of times between saves. The saved board is the query's; this is the draft.
 *
 * `rowIndexByCardId` is kept as a derived index alongside the rows so a pool
 * cell can subscribe to `state.rowIndexByCardId.get(cardId)` — one number —
 * instead of the rows array. Without it every cell in the pool would re-render
 * on every drag, and each would rescan the board to find its own card (see the
 * `.map()` closure note in CLAUDE.md).
 */
interface TierListBuilderState {
  /** The list this draft belongs to; guards against a stale board after navigation. */
  listId: string | null;
  rows: TierRow[];
  /** Card id → the index of the row holding it. Absent means unranked. */
  rowIndexByCardId: Map<string, number>;
  dirty: boolean;

  /** Replaces the draft with a list's saved board. Clears `dirty`. */
  load: (listId: string, rows: readonly TierRow[]) => void;
  /** Clears `dirty` after a successful save, keeping the current board. */
  markSaved: () => void;
  /** Drops the draft entirely (unmount, or navigating to another list). */
  reset: () => void;

  /**
   * Puts a card in a row, removing it from whichever row currently holds it.
   * `position` is an index into the target row **as it looks now**, so dropping
   * a card onto another card always lands it before that card; omitted appends.
   */
  assign: (cardId: string, rowIndex: number, position?: number) => void;
  /** Takes a card off the board entirely, back to the pool. */
  unassign: (cardId: string) => void;

  addRow: () => void;
  /** Removes a row; the cards in it return to the pool. */
  removeRow: (rowIndex: number) => void;
  renameRow: (rowIndex: number, label: string) => void;
  moveRow: (fromIndex: number, toIndex: number) => void;
}

/** @returns `position` clamped to a valid insertion index for `cardIds`. */
function clamp(position: number, cardIds: readonly string[]): number {
  return Math.max(0, Math.min(position, cardIds.length));
}

/** @returns Card id → row index, for every card on the board. */
function indexRows(rows: readonly TierRow[]): Map<string, number> {
  const index = new Map<string, number>();
  for (const [rowIndex, row] of rows.entries()) {
    for (const cardId of row.cardIds) {
      index.set(cardId, rowIndex);
    }
  }
  return index;
}

/**
 * Labels offered to rows added past the S/A/B/C/D defaults. Skips anything the
 * board already uses so a renamed row can't collide with a new one. The
 * candidate list is longer than {@link MAX_TIER_ROWS}, so a full board still
 * leaves free letters; the numbered fallback only exists so the function stays
 * total if that cap ever rises past the alphabet.
 * @returns A label not already used by the board.
 */
function nextRowLabel(rows: readonly TierRow[]): string {
  const used = new Set(rows.map((row) => row.label));
  const free = [..."FGHIJKLMNOPQRSTUVWXYZ"].find((letter) => !used.has(letter));
  return free ?? `Tier ${rows.length + 1}`;
}

/**
 * Applies a row-level edit, refreshing the derived set and marking the draft
 * dirty in one place so no action can forget either.
 * @returns The next slice of state.
 */
function withRows(
  rows: TierRow[],
): Pick<TierListBuilderState, "rows" | "rowIndexByCardId" | "dirty"> {
  return { rows, rowIndexByCardId: indexRows(rows), dirty: true };
}

const EMPTY: Pick<TierListBuilderState, "listId" | "rows" | "rowIndexByCardId" | "dirty"> = {
  listId: null,
  rows: [],
  rowIndexByCardId: new Map(),
  dirty: false,
};

export const useTierListBuilderStore = create<TierListBuilderState>()((set) => ({
  ...EMPTY,

  load: (listId, rows) => {
    const copied = rows.map((row) => ({ label: row.label, cardIds: [...row.cardIds] }));
    set({ listId, rows: copied, rowIndexByCardId: indexRows(copied), dirty: false });
  },

  markSaved: () => {
    set({ dirty: false });
  },

  reset: () => {
    set({ ...EMPTY, rowIndexByCardId: new Map() });
  },

  assign: (cardId, rowIndex, position) =>
    set((state) => {
      if (rowIndex < 0 || rowIndex >= state.rows.length) {
        return state;
      }
      // Where the card sits right now, if it is already on the board. Read
      // before the strip below, because the strip is what shifts the indices.
      const fromPosition = state.rows[rowIndex]?.cardIds.indexOf(cardId) ?? -1;

      // Strip the card from every row first, so a move within the board can't
      // leave a duplicate behind — the contract rejects a card in two tiers.
      const stripped = state.rows.map((row) => ({
        label: row.label,
        cardIds: row.cardIds.filter((id) => id !== cardId),
      }));
      const target = stripped[rowIndex];
      if (!target) {
        return state;
      }
      if (position === undefined) {
        target.cardIds.push(cardId);
        return withRows(stripped);
      }
      // Lifting the card out of this same row shifts everything after it left
      // by one, so a target index past the card's old slot needs the same
      // shift — otherwise dropping a card rightwards lands it one slot too far.
      const shifted = fromPosition >= 0 && fromPosition < position ? position - 1 : position;
      target.cardIds.splice(clamp(shifted, target.cardIds), 0, cardId);
      return withRows(stripped);
    }),

  unassign: (cardId) =>
    set((state) => {
      if (!state.rowIndexByCardId.has(cardId)) {
        return state;
      }
      return withRows(
        state.rows.map((row) => ({
          label: row.label,
          cardIds: row.cardIds.filter((id) => id !== cardId),
        })),
      );
    }),

  addRow: () =>
    set((state) => {
      if (state.rows.length >= MAX_TIER_ROWS) {
        return state;
      }
      return withRows([...state.rows, { label: nextRowLabel(state.rows), cardIds: [] }]);
    }),

  removeRow: (rowIndex) =>
    set((state) => {
      if (rowIndex < 0 || rowIndex >= state.rows.length) {
        return state;
      }
      return withRows(state.rows.filter((_, index) => index !== rowIndex));
    }),

  renameRow: (rowIndex, label) =>
    set((state) => {
      const current = state.rows[rowIndex];
      if (!current || current.label === label) {
        return state;
      }
      return withRows(
        state.rows.map((row, index) => (index === rowIndex ? { ...row, label } : row)),
      );
    }),

  moveRow: (fromIndex, toIndex) =>
    set((state) => {
      const { rows } = state;
      if (
        fromIndex === toIndex ||
        fromIndex < 0 ||
        fromIndex >= rows.length ||
        toIndex < 0 ||
        toIndex >= rows.length
      ) {
        return state;
      }
      const next = [...rows];
      const [moved] = next.splice(fromIndex, 1);
      if (!moved) {
        return state;
      }
      next.splice(toIndex, 0, moved);
      return withRows(next);
    }),
}));

import type { TierCard, TierRow } from "@openrift/shared";
import {
  MAX_CARDS_PER_TIER,
  MAX_TIER_LIST_CARDS,
  MAX_TIER_ROWS,
} from "@openrift/shared/contracts/tier-lists";
import { create } from "zustand";

interface TierListBuilderState {
  listId: string | null;
  rows: TierRow[];
  /** Card id → the index of the row holding it. Absent means unranked. */
  rowIndexByCardId: Map<string, number>;
  dirty: boolean;

  load: (listId: string, rows: readonly TierRow[]) => void;
  /**
   * Clears `dirty` only if `savedRows` is still reference-equal to the
   * current `rows`, so a drag landing mid-save doesn't get marked saved.
   */
  markSaved: (savedRows: readonly TierRow[]) => void;
  reset: () => void;

  /**
   * `position` indexes into the target row as it looks now; omitted appends.
   * Omitted `printingId` keeps whatever the card is already pinned to.
   */
  assign: (
    cardId: string,
    rowIndex: number,
    options?: { position?: number; printingId?: string | null },
  ) => void;
  unassign: (cardId: string) => void;
  /** `printingId` null falls back to the default printing. */
  setPrinting: (cardId: string, printingId: string | null) => void;

  addRow: () => void;
  /** No-op once the board already has an unranked row; the contract allows at most one. */
  addUnrankedRow: () => void;
  removeRow: (rowIndex: number) => void;
  renameRow: (rowIndex: number, label: string) => void;
  moveRow: (fromIndex: number, toIndex: number) => void;
}

const UNRANKED_ROW_LABEL = "Unranked";

function clamp(position: number, cards: readonly TierCard[]): number {
  return Math.max(0, Math.min(position, cards.length));
}

function indexRows(rows: readonly TierRow[]): Map<string, number> {
  const index = new Map<string, number>();
  for (const [rowIndex, row] of rows.entries()) {
    for (const card of row.cards) {
      index.set(card.cardId, rowIndex);
    }
  }
  return index;
}

/** Skips labels already on the board; falls back to a number past the alphabet. */
function nextRowLabel(rows: readonly TierRow[]): string {
  const used = new Set(rows.map((row) => row.label));
  const free = [..."FGHIJKLMNOPQRSTUVWXYZ"].find((letter) => !used.has(letter));
  return free ?? `Tier ${rows.length + 1}`;
}

function rankedRowCount(rows: readonly TierRow[]): number {
  return rows.filter((row) => row.unranked !== true).length;
}

function hasUnranked(rows: readonly TierRow[]): boolean {
  return rows.some((row) => row.unranked === true);
}

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
    // `unranked` is carried only when true, never stamped on as `false`,
    // so an ordinary board round-trips exactly as it arrived.
    const copied = rows.map((row) => ({
      ...(row.unranked === true ? { unranked: true } : {}),
      label: row.label,
      cards: row.cards.map((card) => ({ ...card })),
    }));
    set({ listId, rows: copied, rowIndexByCardId: indexRows(copied), dirty: false });
  },

  markSaved: (savedRows) => {
    set((state) => (state.rows === savedRows ? { dirty: false } : state));
  },

  reset: () => {
    // The fresh Map is load-bearing: spreading EMPTY alone would hand every
    // reset the same shared instance as the initial state.
    set({ ...EMPTY, rowIndexByCardId: new Map() });
  },

  assign: (cardId, rowIndex, options) =>
    set((state) => {
      if (rowIndex < 0 || rowIndex >= state.rows.length) {
        return state;
      }
      const { position, printingId } = options ?? {};
      // Read before the strip below: stripping shifts the indices.
      const fromPosition =
        state.rows[rowIndex]?.cards.findIndex((card) => card.cardId === cardId) ?? -1;
      const pinned =
        printingId === undefined
          ? (state.rows.flatMap((row) => row.cards).find((card) => card.cardId === cardId)
              ?.printingId ?? null)
          : printingId;

      const stripped = state.rows.map((row) => ({
        ...row,
        cards: row.cards.filter((card) => card.cardId !== cardId),
      }));
      const target = stripped[rowIndex];
      if (!target) {
        return state;
      }
      // Post-strip counts, so moving a card within an already-full board is still allowed.
      const total = stripped.reduce((sum, row) => sum + row.cards.length, 0);
      if (target.cards.length >= MAX_CARDS_PER_TIER || total >= MAX_TIER_LIST_CARDS) {
        return state;
      }
      const entry: TierCard = { cardId, printingId: pinned };
      if (position === undefined) {
        target.cards.push(entry);
        return withRows(stripped);
      }
      // Lifting the card out of this row shifts everything after it left by one, so
      // a target past the card's old slot needs the same shift.
      const shifted = fromPosition >= 0 && fromPosition < position ? position - 1 : position;
      target.cards.splice(clamp(shifted, target.cards), 0, entry);
      return withRows(stripped);
    }),

  unassign: (cardId) =>
    set((state) => {
      if (!state.rowIndexByCardId.has(cardId)) {
        return state;
      }
      return withRows(
        state.rows.map((row) => ({
          ...row,
          cards: row.cards.filter((card) => card.cardId !== cardId),
        })),
      );
    }),

  setPrinting: (cardId, printingId) =>
    set((state) => {
      const rowIndex = state.rowIndexByCardId.get(cardId);
      if (rowIndex === undefined) {
        return state;
      }
      const current = state.rows[rowIndex]?.cards.find((card) => card.cardId === cardId);
      if (!current || current.printingId === printingId) {
        return state;
      }
      return withRows(
        state.rows.map((row, index) =>
          index === rowIndex
            ? {
                ...row,
                cards: row.cards.map((card) =>
                  card.cardId === cardId ? { cardId, printingId } : card,
                ),
              }
            : row,
        ),
      );
    }),

  addRow: () =>
    set((state) => {
      if (state.rows.length >= MAX_TIER_ROWS) {
        return state;
      }
      // Inserted after the last ranked row, so an unranked row keeps the bottom.
      const next = [...state.rows];
      next.splice(rankedRowCount(state.rows), 0, { label: nextRowLabel(state.rows), cards: [] });
      return withRows(next);
    }),

  addUnrankedRow: () =>
    set((state) => {
      if (state.rows.length >= MAX_TIER_ROWS || hasUnranked(state.rows)) {
        return state;
      }
      return withRows([...state.rows, { label: UNRANKED_ROW_LABEL, cards: [], unranked: true }]);
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
      // The unranked row is pinned to the bottom: it can't move, and no ranked
      // row can be dropped below it.
      if (rows[fromIndex]?.unranked === true) {
        return state;
      }
      if (hasUnranked(rows) && toIndex >= rows.length - 1) {
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

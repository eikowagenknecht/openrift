import { create } from "zustand";

import { moveQueueEntry } from "@/lib/card-queue";
import { MAX_QUEUE_LENGTH } from "@/lib/presentation-queue";

function countIds(ids: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const id of ids) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

// Must stay a store, not page `useState`: state here would make the grid's
// `renderCard` closure capture it and re-render every cell on each add.
interface PresentQueueState {
  ids: string[];
  countByPrintingId: Map<string, number>;

  load: (ids: readonly string[]) => void;
  add: (printingId: string) => void;
  // Pushes the stop at `index` down, e.g. where a dragged card lands. An
  // index past the end appends.
  insertAt: (printingId: string, index: number) => void;
  addMany: (printingIds: readonly string[]) => { added: number; dropped: number };
  removePrinting: (printingId: string) => void;
  removeAt: (index: number) => void;
  move: (index: number, delta: -1 | 1) => void;
  reorder: (ids: readonly string[]) => void;
  reset: () => void;
}

function withIds(ids: string[]) {
  return { ids, countByPrintingId: countIds(ids) };
}

export const usePresentQueueStore = create<PresentQueueState>()((set, get) => ({
  ids: [],
  countByPrintingId: new Map(),

  load: (ids) => set(withIds(ids.slice(0, MAX_QUEUE_LENGTH))),

  add: (printingId) => {
    const { ids } = get();
    if (ids.length >= MAX_QUEUE_LENGTH) {
      return;
    }
    set(withIds([...ids, printingId]));
  },

  insertAt: (printingId, index) => {
    const { ids } = get();
    if (ids.length >= MAX_QUEUE_LENGTH) {
      return;
    }
    const at = Math.min(Math.max(index, 0), ids.length);
    set(withIds([...ids.slice(0, at), printingId, ...ids.slice(at)]));
  },

  addMany: (printingIds) => {
    const { ids } = get();
    const taken = printingIds.slice(0, Math.max(MAX_QUEUE_LENGTH - ids.length, 0));
    set(withIds([...ids, ...taken]));
    return { added: taken.length, dropped: printingIds.length - taken.length };
  },

  removePrinting: (printingId) => {
    const { ids } = get();
    // Last, not first: the grid's minus undoes the most recent add.
    const at = ids.lastIndexOf(printingId);
    if (at === -1) {
      return;
    }
    set(withIds(ids.filter((_unused, index) => index !== at)));
  },

  removeAt: (index) => {
    const { ids } = get();
    if (index < 0 || index >= ids.length) {
      return;
    }
    set(withIds(ids.filter((_unused, at) => at !== index)));
  },

  move: (index, delta) => set(withIds(moveQueueEntry(get().ids, index, delta))),

  reorder: (ids) => set(withIds([...ids])),

  reset: () => set({ ids: [], countByPrintingId: new Map() }),
}));

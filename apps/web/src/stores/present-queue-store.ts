import { create } from "zustand";

import { moveQueueEntry } from "@/lib/card-queue";
import { MAX_QUEUE_LENGTH } from "@/lib/presentation-queue";

/**
 * Counts how many times each printing appears in the queue.
 *
 * @returns Printing id → how many stops in the queue show it.
 */
function countIds(ids: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const id of ids) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

/**
 * The queue being assembled on `/stage`, before it is handed to an output.
 *
 * It lives in a store rather than the page's `useState` because the queue
 * builder is a card browser: with the queue in component state, the grid's
 * `renderCard` closure would capture it and every cell would re-render on
 * every add (see the `.map()` closure note in CLAUDE.md). `countByPrintingId`
 * is the derived index that makes the per-cell subscription a single number,
 * exactly as `rowIndexByCardId` does for the tier-list pool.
 *
 * It is also what the OBS output's clicker steps, so both of the stage's
 * outputs run the one queue rather than each keeping a list of its own.
 *
 * The URL is still where a queue is *kept* — this is the draft between loading
 * one and putting it on screen.
 */
interface PresentQueueState {
  /** Printing ids in presentation order. A printing may repeat. */
  ids: string[];
  /** Printing id → how many times it is queued, for per-cell subscriptions. */
  countByPrintingId: Map<string, number>;

  /** Replaces the draft, e.g. with the queue an arriving URL carried. */
  load: (ids: readonly string[]) => void;
  /** Appends one printing. A no-op once the queue is at its limit. */
  add: (printingId: string) => void;
  /**
   * Puts one printing in at `index`, pushing the stop that was there down —
   * where a card dragged onto an existing stop lands. An index past the end
   * appends, so a release below the last row does the obvious thing. A no-op
   * once the queue is at its limit.
   */
  insertAt: (printingId: string, index: number) => void;
  /**
   * Appends a batch, stopping at the limit.
   *
   * @returns How many landed and how many the queue had no room for.
   */
  addMany: (printingIds: readonly string[]) => { added: number; dropped: number };
  /** Drops the last stop showing this printing — the grid cell's minus. */
  removePrinting: (printingId: string) => void;
  /** Drops one stop by position — the queue list's remove. */
  removeAt: (index: number) => void;
  /** Moves the stop at `index` by `delta`, clamped at both ends. */
  move: (index: number, delta: -1 | 1) => void;
  /** Replaces the order wholesale, e.g. after a drag. */
  reorder: (ids: readonly string[]) => void;
  reset: () => void;
}

/** @returns The state patch for a new id list, with its count index rebuilt. */
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
    // Last rather than first: the grid's minus undoes the add the creator just
    // made, which is the one at the end.
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

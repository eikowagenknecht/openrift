import type { Printing } from "@openrift/shared";
import { create } from "zustand";

/**
 * One tray row: a printing the scan session added, with the copies behind it
 * so undo (and the finish switch, which is dispose-and-re-add) can act on the
 * newest copy first. Copies are already committed to the collection when the
 * row appears — the tray is a session log with handles, not a pending queue.
 */
export interface ScanSessionRow {
  printing: Printing;
  /**
   * The copies this row stands for. Empty when the session is not adding to a
   * collection: the scan then only names the card, and the row is a reading
   * rather than a handle on anything.
   */
  copyIds: string[];
  /** Adds sent to the API but not yet confirmed (temp copy ids in copyIds). */
  pendingCount: number;
}

interface ScanSessionState {
  /** Rows keyed by printing id, most recently touched last. */
  rows: Map<string, ScanSessionRow>;
  /**
   * Cards recognised this session, counting every scan rather than every row.
   * The tray's disclosure watches it to hand its controls back to the newest
   * row whenever a new card lands.
   */
  scans: number;
  recordPending: (printing: Printing, tempCopyId: string) => void;
  /** Log a recognised card the session is not adding to any collection. */
  recordIdentified: (printing: Printing) => void;
  /** Swap a pending temp copy id for the server-confirmed one. */
  confirmAdd: (printingId: string, tempCopyId: string, copyId: string) => void;
  /** Drop a pending copy whose add failed. */
  dropPending: (printingId: string, tempCopyId: string) => void;
  /** Remove one specific copy from a row (undo, or the finish switch's source side). */
  removeCopy: (printingId: string, copyId: string) => void;
  /** Put an already-confirmed copy back (rollback of a failed remove). */
  recordConfirmed: (printing: Printing, copyId: string) => void;
  reset: () => void;
}

export const useScanSessionStore = create<ScanSessionState>()((set) => ({
  rows: new Map(),
  scans: 0,

  recordPending: (printing, tempCopyId) =>
    set((state) => {
      const next = new Map(state.rows);
      const existing = state.rows.get(printing.id);
      // delete + set keeps insertion order = most recently touched last.
      next.delete(printing.id);
      next.set(printing.id, {
        printing,
        copyIds: [...(existing?.copyIds ?? []), tempCopyId],
        pendingCount: (existing?.pendingCount ?? 0) + 1,
      });
      return { rows: next, scans: state.scans + 1 };
    }),

  recordIdentified: (printing) =>
    set((state) => {
      const next = new Map(state.rows);
      const existing = state.rows.get(printing.id);
      next.delete(printing.id);
      next.set(printing.id, {
        printing,
        copyIds: existing?.copyIds ?? [],
        pendingCount: existing?.pendingCount ?? 0,
      });
      return { rows: next, scans: state.scans + 1 };
    }),

  confirmAdd: (printingId, tempCopyId, copyId) =>
    set((state) => {
      const existing = state.rows.get(printingId);
      if (!existing) {
        return state;
      }
      // Duplicate keys keep their first position in the Map constructor, so
      // confirming does not move the row.
      const next = new Map<string, ScanSessionRow>([
        ...state.rows,
        [
          printingId,
          {
            ...existing,
            copyIds: existing.copyIds.map((id) => (id === tempCopyId ? copyId : id)),
            pendingCount: Math.max(0, existing.pendingCount - 1),
          },
        ],
      ]);
      return { rows: next };
    }),

  dropPending: (printingId, tempCopyId) =>
    set((state) => {
      const existing = state.rows.get(printingId);
      if (!existing) {
        return state;
      }
      const next = new Map(state.rows);
      const copyIds = existing.copyIds.filter((id) => id !== tempCopyId);
      if (copyIds.length === 0) {
        next.delete(printingId);
      } else {
        next.set(printingId, {
          ...existing,
          copyIds,
          pendingCount: Math.max(0, existing.pendingCount - 1),
        });
      }
      return { rows: next };
    }),

  removeCopy: (printingId, copyId) =>
    set((state) => {
      const existing = state.rows.get(printingId);
      if (!existing || !existing.copyIds.includes(copyId)) {
        return state;
      }
      const next = new Map(state.rows);
      const copyIds = existing.copyIds.filter((id) => id !== copyId);
      if (copyIds.length === 0) {
        next.delete(printingId);
      } else {
        next.set(printingId, { ...existing, copyIds });
      }
      return { rows: next };
    }),

  recordConfirmed: (printing, copyId) =>
    set((state) => {
      const existing = state.rows.get(printing.id);
      const next = new Map(state.rows);
      next.delete(printing.id);
      next.set(printing.id, {
        printing,
        copyIds: [...(existing?.copyIds ?? []), copyId],
        pendingCount: existing?.pendingCount ?? 0,
      });
      return { rows: next };
    }),

  reset: () => set({ rows: new Map(), scans: 0 }),
}));

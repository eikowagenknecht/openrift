import type { Printing } from "@openrift/shared";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface ScanSessionRow {
  printing: Printing;
  count: number;
}

interface PersistedScanRow {
  printingId: string;
  count: number;
}

export interface ScanPendingAdd {
  batchId: string;
  collectionId: string;
  jobs: { id: string; printingId: string }[];
}

interface PersistedScanSession {
  rows: PersistedScanRow[];
  scans: number;
  lastScanAt: number | null;
  pending: ScanPendingAdd | null;
}

interface RestoredScanSession {
  cards: number;
  lastScanAt: number | null;
}

interface ScanSessionState {
  rows: Map<string, ScanSessionRow>;
  scans: number;
  lastScanAt: number | null;
  restored: PersistedScanSession | null;
  resumed: RestoredScanSession | null;
  pending: ScanPendingAdd | null;
  add: (printing: Printing) => void;
  remove: (printingId: string) => void;
  move: (fromPrintingId: string, to: Printing) => void;
  take: (counts: ReadonlyMap<string, number>) => void;
  putBack: (rows: readonly ScanSessionRow[]) => void;
  clear: () => ScanSessionRow[];
  setPending: (pending: ScanPendingAdd) => void;
  clearPending: () => void;
  restore: (lookupPrinting: (printingId: string) => Printing | undefined) => void;
  dismissResumed: () => void;
  reset: () => void;
}

function readPersistedRow(value: unknown): PersistedScanRow | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const row = value as Record<string, unknown>;
  if (typeof row.printingId !== "string") {
    return null;
  }
  // A blob from the copy-per-scan shape counts only what it never wrote to a
  // collection; the copies behind `copyIds` are already there.
  const count = typeof row.count === "number" ? row.count : row.identifiedCount;
  if (typeof count !== "number" || !Number.isFinite(count) || count <= 0) {
    return null;
  }
  return { printingId: row.printingId, count: Math.floor(count) };
}

/**
 * While a rehydrated payload is still waiting for restore(), it IS the
 * session: an early write must persist it unchanged, not the empty rows.
 */
function toPersisted(state: ScanSessionState): PersistedScanSession {
  if (state.restored) {
    return state.restored;
  }
  const rows: PersistedScanRow[] = [];
  for (const row of state.rows.values()) {
    if (row.count <= 0) {
      continue;
    }
    rows.push({ printingId: row.printing.id, count: row.count });
  }
  return { rows, scans: state.scans, lastScanAt: state.lastScanAt, pending: state.pending };
}

function readPersistedPending(value: unknown): ScanPendingAdd | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const pending = value as Record<string, unknown>;
  if (typeof pending.batchId !== "string" || typeof pending.collectionId !== "string") {
    return null;
  }
  if (!Array.isArray(pending.jobs)) {
    return null;
  }
  const jobs: { id: string; printingId: string }[] = [];
  for (const entry of pending.jobs) {
    if (typeof entry !== "object" || entry === null) {
      return null;
    }
    const job = entry as Record<string, unknown>;
    if (typeof job.id !== "string" || typeof job.printingId !== "string") {
      return null;
    }
    jobs.push({ id: job.id, printingId: job.printingId });
  }
  if (jobs.length === 0) {
    return null;
  }
  return { batchId: pending.batchId, collectionId: pending.collectionId, jobs };
}

export const useScanSessionStore = create<ScanSessionState>()(
  persist(
    (set, get) => ({
      rows: new Map(),
      scans: 0,
      lastScanAt: null,
      restored: null,
      resumed: null,
      pending: null,

      add: (printing) =>
        set((state) => {
          const next = new Map(state.rows);
          const existing = state.rows.get(printing.id);
          // delete + set keeps insertion order = most recently scanned last.
          next.delete(printing.id);
          next.set(printing.id, { printing, count: (existing?.count ?? 0) + 1 });
          return { rows: next, scans: state.scans + 1, lastScanAt: Date.now(), resumed: null };
        }),

      remove: (printingId) =>
        set((state) => {
          const existing = state.rows.get(printingId);
          if (!existing) {
            return state;
          }
          const count = existing.count - 1;
          if (count <= 0) {
            const next = new Map(state.rows);
            next.delete(printingId);
            return { rows: next };
          }
          const next = new Map<string, ScanSessionRow>();
          for (const [key, row] of state.rows) {
            next.set(key, key === printingId ? { ...row, count } : row);
          }
          return { rows: next };
        }),

      move: (fromPrintingId, to) =>
        set((state) => {
          const from = state.rows.get(fromPrintingId);
          if (!from || from.count <= 0 || fromPrintingId === to.id) {
            return state;
          }
          const fromCount = from.count - 1;
          const next = new Map<string, ScanSessionRow>();
          for (const [key, row] of state.rows) {
            if (key === fromPrintingId) {
              if (fromCount > 0) {
                next.set(key, { ...row, count: fromCount });
              } else if (!state.rows.has(to.id)) {
                next.set(to.id, { printing: to, count: 1 });
              }
              continue;
            }
            next.set(key, key === to.id ? { printing: to, count: row.count + 1 } : row);
          }
          if (!next.has(to.id)) {
            next.set(to.id, { printing: to, count: 1 });
          }
          return { rows: next };
        }),

      take: (counts) =>
        set((state) => {
          const next = new Map<string, ScanSessionRow>();
          for (const [key, row] of state.rows) {
            const count = row.count - (counts.get(key) ?? 0);
            if (count > 0) {
              next.set(key, { ...row, count });
            }
          }
          return { rows: next };
        }),

      putBack: (rows) =>
        set((state) => {
          const next = new Map(state.rows);
          for (const row of rows) {
            if (row.count <= 0) {
              continue;
            }
            const existing = next.get(row.printing.id);
            next.set(row.printing.id, {
              printing: existing?.printing ?? row.printing,
              count: (existing?.count ?? 0) + row.count,
            });
          }
          return { rows: next };
        }),

      clear: () => {
        const cleared = [...get().rows.values()];
        set({ rows: new Map(), resumed: null, pending: null });
        return cleared;
      },

      setPending: (pending) => set({ pending }),

      clearPending: () => set({ pending: null }),

      restore: (lookupPrinting) => {
        const payload = get().restored;
        if (!payload) {
          return;
        }
        let cards = 0;
        set((state) => {
          const next = new Map<string, ScanSessionRow>();
          for (const persistedRow of payload.rows) {
            const printing = lookupPrinting(persistedRow.printingId);
            if (!printing || persistedRow.count <= 0) {
              continue;
            }
            cards += persistedRow.count;
            next.set(printing.id, { printing, count: persistedRow.count });
          }
          // Cards scanned before the restore ran are newer than anything in the
          // payload, so they re-append behind the restored rows.
          for (const [printingId, row] of state.rows) {
            const earlier = next.get(printingId);
            next.delete(printingId);
            next.set(printingId, earlier ? { ...row, count: earlier.count + row.count } : row);
          }
          return {
            rows: next,
            scans: state.scans + payload.scans,
            lastScanAt: state.lastScanAt ?? payload.lastScanAt,
            restored: null,
            pending: state.pending ?? payload.pending,
          };
        });
        set({ resumed: cards === 0 ? null : { cards, lastScanAt: payload.lastScanAt } });
      },

      dismissResumed: () => set({ resumed: null }),

      reset: () =>
        set({
          rows: new Map(),
          scans: 0,
          lastScanAt: null,
          restored: null,
          resumed: null,
          pending: null,
        }),
    }),
    {
      name: "openrift-scan-session",
      partialize: toPersisted,
      merge: (persisted, current) => {
        const raw = (persisted as Record<string, unknown>) ?? {};
        const rows: PersistedScanRow[] = [];
        if (Array.isArray(raw.rows)) {
          for (const value of raw.rows) {
            const row = readPersistedRow(value);
            if (row) {
              rows.push(row);
            }
          }
        }
        const pending = readPersistedPending(raw.pending);
        if (rows.length === 0 && pending === null) {
          return current;
        }
        return {
          ...current,
          restored: {
            rows,
            scans: typeof raw.scans === "number" ? raw.scans : rows.length,
            lastScanAt: typeof raw.lastScanAt === "number" ? raw.lastScanAt : null,
            pending,
          },
        };
      },
    },
  ),
);

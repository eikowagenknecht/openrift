import type { Printing } from "@openrift/shared";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { isTempCopyId } from "@/lib/temp-copy-id";

/**
 * Copies behind a tray row are already committed to the collection; the tray
 * is a session log with handles, not a pending queue.
 */
export interface ScanSessionRow {
  printing: Printing;
  copyIds: string[];
  pendingCount: number;
  identifiedCount: number;
}

export function sessionCountOf(row: ScanSessionRow): number {
  return row.copyIds.length + row.identifiedCount;
}

interface PersistedScanRow {
  printingId: string;
  copyIds: string[];
  identifiedCount: number;
}

interface PersistedScanSession {
  rows: PersistedScanRow[];
  scans: number;
  lastScanAt: number | null;
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
  recordPending: (printing: Printing, tempCopyId: string) => void;
  recordIdentified: (printing: Printing) => void;
  confirmAdd: (printingId: string, tempCopyId: string, copyId: string) => void;
  dropPending: (printingId: string, tempCopyId: string) => void;
  removeIdentified: (printingId: string) => void;
  convertIdentifiedToPending: (printingId: string, tempCopyId: string) => void;
  revertConvertToPending: (printingId: string, tempCopyId: string) => void;
  removeCopy: (printingId: string, copyId: string) => void;
  recordConfirmed: (printing: Printing, copyId: string) => void;
  resumed: RestoredScanSession | null;
  restore: (lookupPrinting: (printingId: string) => Printing | undefined) => void;
  dismissResumed: () => void;
  reset: () => void;
}

function isPersistedRow(value: unknown): value is PersistedScanRow {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const row = value as Record<string, unknown>;
  return (
    typeof row.printingId === "string" &&
    Array.isArray(row.copyIds) &&
    row.copyIds.every((id) => typeof id === "string") &&
    typeof row.identifiedCount === "number" &&
    row.identifiedCount >= 0
  );
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
    const copyIds = row.copyIds.filter((id) => !isTempCopyId(id));
    if (copyIds.length === 0 && row.identifiedCount === 0) {
      continue;
    }
    rows.push({ printingId: row.printing.id, copyIds, identifiedCount: row.identifiedCount });
  }
  return { rows, scans: state.scans, lastScanAt: state.lastScanAt };
}

export const useScanSessionStore = create<ScanSessionState>()(
  persist(
    (set, get) => ({
      rows: new Map(),
      scans: 0,
      lastScanAt: null,
      restored: null,

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
            identifiedCount: existing?.identifiedCount ?? 0,
          });
          return { rows: next, scans: state.scans + 1, lastScanAt: Date.now() };
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
            identifiedCount: (existing?.identifiedCount ?? 0) + 1,
          });
          return { rows: next, scans: state.scans + 1, lastScanAt: Date.now() };
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
          if (copyIds.length === 0 && existing.identifiedCount === 0) {
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

      convertIdentifiedToPending: (printingId, tempCopyId) =>
        set((state) => {
          const existing = state.rows.get(printingId);
          if (!existing || existing.identifiedCount === 0) {
            return state;
          }
          // Duplicate keys keep their first position in the Map constructor, so
          // converting does not move the row.
          const next = new Map<string, ScanSessionRow>([
            ...state.rows,
            [
              printingId,
              {
                ...existing,
                copyIds: [...existing.copyIds, tempCopyId],
                pendingCount: existing.pendingCount + 1,
                identifiedCount: existing.identifiedCount - 1,
              },
            ],
          ]);
          return { rows: next };
        }),

      revertConvertToPending: (printingId, tempCopyId) =>
        set((state) => {
          const existing = state.rows.get(printingId);
          if (!existing || !existing.copyIds.includes(tempCopyId)) {
            return state;
          }
          const next = new Map<string, ScanSessionRow>([
            ...state.rows,
            [
              printingId,
              {
                ...existing,
                copyIds: existing.copyIds.filter((id) => id !== tempCopyId),
                pendingCount: Math.max(0, existing.pendingCount - 1),
                identifiedCount: existing.identifiedCount + 1,
              },
            ],
          ]);
          return { rows: next };
        }),

      removeIdentified: (printingId) =>
        set((state) => {
          const existing = state.rows.get(printingId);
          if (!existing || existing.identifiedCount === 0) {
            return state;
          }
          const next = new Map(state.rows);
          const identifiedCount = existing.identifiedCount - 1;
          if (identifiedCount === 0 && existing.copyIds.length === 0) {
            next.delete(printingId);
          } else {
            next.set(printingId, { ...existing, identifiedCount });
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
          if (copyIds.length === 0 && existing.identifiedCount === 0) {
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
            identifiedCount: existing?.identifiedCount ?? 0,
          });
          return { rows: next };
        }),

      resumed: null,

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
            if (!printing) {
              continue;
            }
            // Temp ids should never have been stored, but a payload written by
            // an older bundle gets the same defence as the write path.
            const copyIds = persistedRow.copyIds.filter((id) => !isTempCopyId(id));
            if (copyIds.length === 0 && persistedRow.identifiedCount === 0) {
              continue;
            }
            cards += copyIds.length + persistedRow.identifiedCount;
            next.set(printing.id, {
              printing,
              copyIds,
              pendingCount: 0,
              identifiedCount: persistedRow.identifiedCount,
            });
          }
          // Cards scanned before the restore ran are newer than anything in the
          // payload, so they re-append behind the restored rows.
          for (const [printingId, row] of state.rows) {
            const earlier = next.get(printingId);
            next.delete(printingId);
            next.set(
              printingId,
              earlier
                ? {
                    ...row,
                    copyIds: [...earlier.copyIds, ...row.copyIds],
                    identifiedCount: earlier.identifiedCount + row.identifiedCount,
                  }
                : row,
            );
          }
          return {
            rows: next,
            scans: state.scans + payload.scans,
            lastScanAt: state.lastScanAt ?? payload.lastScanAt,
            restored: null,
          };
        });
        set({ resumed: cards === 0 ? null : { cards, lastScanAt: payload.lastScanAt } });
      },

      dismissResumed: () => set({ resumed: null }),

      reset: () =>
        set({ rows: new Map(), scans: 0, lastScanAt: null, restored: null, resumed: null }),
    }),
    {
      name: "openrift-scan-session",
      partialize: toPersisted,
      merge: (persisted, current) => {
        const raw = (persisted as Record<string, unknown>) ?? {};
        const rows = Array.isArray(raw.rows) ? raw.rows.filter(isPersistedRow) : [];
        if (rows.length === 0) {
          return current;
        }
        return {
          ...current,
          restored: {
            rows,
            scans: typeof raw.scans === "number" ? raw.scans : rows.length,
            lastScanAt: typeof raw.lastScanAt === "number" ? raw.lastScanAt : null,
          },
        };
      },
    },
  ),
);

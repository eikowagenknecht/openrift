import type { Printing } from "@openrift/shared";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { isTempCopyId } from "@/lib/temp-copy-id";

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
  /**
   * Copies recognised while the session was not adding to a collection.
   * Counted so an identify-only session (checking a fresh pack, say) still
   * knows it saw three of a card, even though no copy stands behind them.
   */
  identifiedCount: number;
}

/**
 * How many physical cards a row stands for: collected copies plus
 * identify-only readings. What the tray's count pill and the session summary
 * both mean by "count".
 *
 * @returns The row's total card count.
 */
export function sessionCountOf(row: ScanSessionRow): number {
  return row.copyIds.length + row.identifiedCount;
}

/**
 * One persisted row: ids only. Printings are catalog data, so a stored row
 * carries the printing id and rehydrates the full object from the catalog on
 * {@link ScanSessionState.restore}.
 */
interface PersistedScanRow {
  printingId: string;
  copyIds: string[];
  identifiedCount: number;
}

/** The stored shape of a session, staged in `restored` until the catalog is up. */
interface PersistedScanSession {
  rows: PersistedScanRow[];
  scans: number;
  lastScanAt: number | null;
}

/** What {@link ScanSessionState.restore} hands the page for its resume banner. */
interface RestoredScanSession {
  /** Physical cards the restored rows stand for (copies plus readings). */
  cards: number;
  /** When the restored session last recognised a card, if it ever did. */
  lastScanAt: number | null;
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
  /** When the session last recognised a card; null before the first scan. */
  lastScanAt: number | null;
  /**
   * A persisted session waiting for the catalog: rehydration stashes it here
   * because rows need full printings, which only the page can look up. Cleared
   * by {@link restore} (and by {@link reset}, which ends the session outright).
   */
  restored: PersistedScanSession | null;
  recordPending: (printing: Printing, tempCopyId: string) => void;
  /** Log a recognised card the session is not adding to any collection. */
  recordIdentified: (printing: Printing) => void;
  /** Swap a pending temp copy id for the server-confirmed one. */
  confirmAdd: (printingId: string, tempCopyId: string, copyId: string) => void;
  /** Drop a pending copy whose add failed. */
  dropPending: (printingId: string, tempCopyId: string) => void;
  /** Remove one identify-only reading from a row (undo without a copy behind it). */
  removeIdentified: (printingId: string) => void;
  /**
   * Turn one identify-only reading into a pending copy (the add-all commit).
   * Keeps the row where it is: converting the list must not shuffle it.
   */
  convertIdentifiedToPending: (printingId: string, tempCopyId: string) => void;
  /** Put a reading back when its converted add failed (rollback). */
  revertConvertToPending: (printingId: string, tempCopyId: string) => void;
  /** Remove one specific copy from a row (undo, or the finish switch's source side). */
  removeCopy: (printingId: string, copyId: string) => void;
  /** Put an already-confirmed copy back (rollback of a failed remove). */
  recordConfirmed: (printing: Printing, copyId: string) => void;
  /**
   * Rebuild the tray rows from the persisted session, looking each printing up
   * in the catalog. Readings whose printing left the catalog are dropped. Rows
   * scanned before the restore ran stay the newest.
   *
   * @returns What was restored (for the resume banner), or null when there was
   *   nothing to restore.
   */
  restore: (
    lookupPrinting: (printingId: string) => Printing | undefined,
  ) => RestoredScanSession | null;
  reset: () => void;
}

/**
 * Shape-check one persisted row; anything malformed is dropped rather than
 * poisoning the whole restore.
 *
 * @returns Whether the value is a usable persisted row.
 */
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
 * The session as it goes into storage: ids only, no printings, no pendings. A
 * pending add cannot confirm after a reload, so temp ids are dropped here and
 * rows that held nothing else vanish with them. While a rehydrated payload is
 * still waiting for {@link ScanSessionState.restore}, it IS the session — an
 * early write must persist it unchanged, not overwrite it with the empty rows.
 *
 * @returns The serializable session slice.
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

      restore: (lookupPrinting) => {
        const payload = get().restored;
        if (!payload) {
          return null;
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
        return cards === 0 ? null : { cards, lastScanAt: payload.lastScanAt };
      },

      reset: () => set({ rows: new Map(), scans: 0, lastScanAt: null, restored: null }),
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

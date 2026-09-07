const STORAGE_KEY = "openrift-scan-journal";

export const MAX_SCAN_JOURNAL_ENTRIES = 500;

type ScanJournalPayload =
  | { type: "open"; rows: number; cards: number; pending: string | null }
  | { type: "scan"; printingId: string }
  | { type: "add-start"; batchId: string; collectionId: string; jobs: number }
  | { type: "add-settled"; batchId: string; confirmed: number; failed: number }
  | { type: "clear"; cards: number }
  | { type: "undo-add"; batchId: string; copies: number }
  | { type: "restore"; cards: number; pending: string | null }
  | { type: "reload-prompt" };

/** `t` is epoch ms. */
export type ScanJournalEntry = ScanJournalPayload & { t: number };

// Absent on the server, and Safari in private mode throws on the property
// access itself rather than on use.
function storage(): Storage | null {
  try {
    return (globalThis.localStorage as Storage | undefined) ?? null;
  } catch {
    return null;
  }
}

function rawJournal(): string | null {
  const store = storage();
  if (store === null) {
    return null;
  }
  try {
    return store.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function hasScanJournal(): boolean {
  return rawJournal() !== null;
}

function writeRaw(store: Storage, value: string): boolean {
  try {
    store.setItem(STORAGE_KEY, value);
    return true;
  } catch {
    return false;
  }
}

function isEntry(value: unknown): value is ScanJournalEntry {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const entry = value as Record<string, unknown>;
  return typeof entry.t === "number" && Number.isFinite(entry.t) && typeof entry.type === "string";
}

export function readScanJournal(): ScanJournalEntry[] {
  const raw = rawJournal();
  if (raw === null) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    const entries: ScanJournalEntry[] = [];
    for (const value of parsed) {
      if (isEntry(value)) {
        entries.push(value);
      }
    }
    return entries.slice(-MAX_SCAN_JOURNAL_ENTRIES);
  } catch {
    return [];
  }
}

export function appendScanJournal(payload: ScanJournalPayload): void {
  const store = storage();
  if (store === null) {
    return;
  }
  const entries = readScanJournal();
  entries.push({ ...payload, t: Date.now() });
  writeRaw(store, JSON.stringify(entries.slice(-MAX_SCAN_JOURNAL_ENTRIES)));
}

// Browser-side persistence for TanStack DB collections (ADR-027, step 1).
// One OPFS-backed SQLite database per browser profile, shared by every
// persisted collection; a BroadcastChannel coordinator elects a leader tab so
// multiple tabs share a single writer.
//
// Persistence is best-effort: on the server, in browsers without OPFS or
// Worker support, and on any initialization failure we settle to `null` and
// collections run plain in-memory, exactly as before this feature existed.
// State settles exactly once per page load — collection identity must never
// flip between persisted and non-persisted mid-session, because live queries
// would re-subscribe and in-flight optimistic state would be lost.

import {
  BrowserCollectionCoordinator,
  createBrowserWASQLitePersistence,
  openBrowserWASQLiteOPFSDatabase,
} from "@tanstack/browser-db-sqlite-persistence";
import type { BrowserWASQLiteDatabase } from "@tanstack/browser-db-sqlite-persistence";
import { PersistenceUnavailableError } from "@tanstack/db-sqlite-persistence-core";
import type { PersistedCollectionPersistence } from "@tanstack/db-sqlite-persistence-core";
import { useSyncExternalStore } from "react";

const DATABASE_NAME = "openrift.sqlite";

export type PersistenceState =
  | { status: "pending" }
  | { status: "ready"; persistence: PersistedCollectionPersistence | null };

// Stable snapshot objects — useSyncExternalStore compares by reference, and
// the server snapshot must be the same value as the initial client snapshot
// so SSR and first client render agree (both render without persistence).
const PENDING_STATE: PersistenceState = { status: "pending" };

let state: PersistenceState = PENDING_STATE;
let initStarted = false;
let databaseHandle: BrowserWASQLiteDatabase | null = null;
const listeners = new Set<() => void>();

function settle(persistence: PersistedCollectionPersistence | null): void {
  state = { status: "ready", persistence };
  for (const listener of listeners) {
    // oxlint-disable-next-line promise/prefer-await-to-callbacks -- sync store subscribers
    listener();
  }
}

async function initialize(): Promise<void> {
  try {
    // Open the database before constructing the coordinator: the open call
    // does the feature detection (OPFS + Worker), so unsupported browsers
    // never create a BroadcastChannel.
    const database = await openBrowserWASQLiteOPFSDatabase({ databaseName: DATABASE_NAME });
    const coordinator = new BrowserCollectionCoordinator({ dbName: DATABASE_NAME });
    databaseHandle = database;
    settle(createBrowserWASQLitePersistence({ database, coordinator }));
  } catch (error) {
    if (error instanceof PersistenceUnavailableError) {
      // Expected on browsers without OPFS sync-access support (older Safari,
      // some private-browsing modes). The app works identically, minus the
      // local cache.
      console.info(`Local persistence unavailable, running in-memory: ${error.message}`);
    } else {
      console.warn("Local persistence failed to initialize, running in-memory:", error);
    }
    settle(null);
  }
}

function ensureInitStarted(): void {
  if (initStarted) {
    return;
  }
  initStarted = true;
  void initialize();
}

/**
 * Subscribe to persistence-state changes. Initialization starts lazily on the
 * first subscription, which only ever happens in the browser
 * (`useSyncExternalStore` subscribes after hydration).
 *
 * @returns An unsubscribe function.
 */
export function subscribeToPersistence(listener: () => void): () => void {
  ensureInitStarted();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Current persistence state. `pending` until the OPFS database has either
 * opened or failed; afterwards `ready` with the shared persistence instance,
 * or `ready` with `null` when this browser can't persist.
 *
 * @returns The current persistence state snapshot.
 */
export function getPersistenceSnapshot(): PersistenceState {
  return state;
}

function getServerSnapshot(): PersistenceState {
  return PENDING_STATE;
}

/**
 * React hook: the shared browser persistence state. Consumers that create
 * collections must wait for `status === "ready"` before doing so, then pass
 * `persistence` (which may be null) into the collection factory.
 *
 * @returns The current persistence state.
 */
export function usePersistence(): PersistenceState {
  return useSyncExternalStore(subscribeToPersistence, getPersistenceSnapshot, getServerSnapshot);
}

function waitForSettled(): Promise<void> {
  if (state.status === "ready") {
    return Promise.resolve();
  }
  const { promise, resolve } = Promise.withResolvers<void>();
  const unsubscribe = subscribeToPersistence(() => {
    if (state.status === "ready") {
      unsubscribe();
      resolve();
    }
  });
  return promise;
}

// Data-bearing tables in the persistence schema. Per-collection row and
// tombstone tables are named `c_<hash>_<len>` / `t_<hash>_<len>` (see
// createPersistedTableName in @tanstack/db-sqlite-persistence-core);
// applied_tx holds replayable tx payloads, collection_metadata holds sync
// metadata, collection_version holds per-collection sync positions. The
// registry and leader-coordination tables hold no user data and stay
// untouched so running machinery (including other tabs) is not disturbed.
const PER_COLLECTION_TABLE_PATTERN = /^[ct]_[0-9a-z]+_[0-9a-z]+$/u;
const SHARED_DATA_TABLES = new Set(["applied_tx", "collection_metadata", "collection_version"]);

/**
 * Wipe all locally persisted collection data. Used on sign-out and account
 * deletion: the cached rows belong to the account that just left, and must
 * not stay readable on a shared machine. Deletes rows but keeps the schema,
 * so persistence keeps working for a next sign-in without a reload. No-op
 * when persistence is unavailable; waits for initialization when it is still
 * pending (the data from previous sessions must be wiped even if this page
 * never created a collection).
 *
 * @returns A promise that resolves once the wipe has completed.
 */
export async function wipePersistedData(): Promise<void> {
  if (globalThis.window === undefined) {
    return;
  }
  ensureInitStarted();
  await waitForSettled();
  if (!databaseHandle) {
    return;
  }
  try {
    const tables = await databaseHandle.execute<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
    );
    for (const { name } of tables) {
      if (PER_COLLECTION_TABLE_PATTERN.test(name) || SHARED_DATA_TABLES.has(name)) {
        await databaseHandle.execute(`DELETE FROM "${name}"`);
      }
    }
  } catch (error) {
    // A failed wipe must never break the sign-out flow itself.
    console.warn("Failed to wipe locally persisted data:", error);
  }
}

/**
 * Test-only: reset module state so each test starts from `pending` with no
 * initialization attempted.
 *
 * @returns Nothing.
 */
export function resetPersistenceForTesting(): void {
  state = PENDING_STATE;
  initStarted = false;
  databaseHandle = null;
  listeners.clear();
}

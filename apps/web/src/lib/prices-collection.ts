// Public current-prices sync (ADR-027 prices vertical, WEB half).
//
// The latest headline price per (printing, marketplace) is public, read-only,
// and identical for every visitor, so it is synced through one single-table
// Electric shape (`latest_printing_prices`, ~8.8k rows: printing_id,
// marketplace, headline_cents) and pivoted client-side into the same
// `PriceLookup` the edge `/prices` fetch produces. Once the shape has synced,
// `usePrices` reads from here and the local SQLite cache rehydrates instantly
// on return visits; the shape only streams deltas when prices change (the
// price-refresh crons run ~daily).
//
// This is a READ-ONLY vertical: no writes, no offline executor, no txid. The
// collection carries no onInsert/onUpdate/onDelete and there is nothing to
// queue. Prices are public, so this is a GLOBAL module-level singleton (not
// keyed by user) — exactly like the catalog collections.
//
// It shares the one OPFS database, the one persistence coordinator, and the
// SAME `PERSISTED_SCHEMA_VERSION` as every other persisted collection.
// Diverging the version silently cross-wipes the other verticals' rows (see the
// long comment in copies-collection.ts) — so we import the constant, never
// redefine it. Adding a new shape needs no bump; the table starts empty.
//
// Derivation strategy mirrors the catalog: prices change rarely (once per day
// at most), so rather than wiring a differential live query we pivot the plain
// collection snapshot into a `PriceMap` and then a `PriceLookup` on each change,
// memoized on a version key that bumps whenever the shape emits a change. The
// recompute is cheap relative to how often it runs.

import type { Marketplace, PriceLookup, PriceMap } from "@openrift/shared";
import { priceLookupFromMap } from "@openrift/shared";
import { persistedCollectionOptions } from "@tanstack/db-sqlite-persistence-core";
import type { PersistedCollectionPersistence } from "@tanstack/db-sqlite-persistence-core";
import { electricCollectionOptions } from "@tanstack/electric-db-collection";
import type { ElectricCollectionUtils } from "@tanstack/electric-db-collection";
import { createCollection } from "@tanstack/react-db";
import type { Collection } from "@tanstack/react-db";
import { useSyncExternalStore } from "react";

import { useHydrated } from "@/hooks/use-hydrated";
import { PERSISTED_SCHEMA_VERSION } from "@/lib/copies-collection";
import { usePersistence } from "@/lib/db-persistence";

// Raw shape row, mirroring the columns the public proxy pins (see
// apps/api/src/routes/public/public-shapes.ts `latestPrices`). Type alias, not
// an interface: the Electric adapter's `T extends Row<unknown>` constraint needs
// the implicit index signature interfaces don't get.
// oxlint-disable-next-line typescript/consistent-type-definitions -- see above
type LatestPriceShapeRow = {
  printing_id: string;
  marketplace: string;
  headline_cents: number;
};

type PricesCollection = Collection<LatestPriceShapeRow, string | number>;

interface PricesStoreEntry {
  collection: PricesCollection;
  /**
   * Monotonic version, bumped on every change emitted by the collection.
   * Subscribers re-read; the derivation cache keys on it.
   */
  version: number;
  listeners: Set<() => void>;
  unsubscribes: (() => void)[];
  /** Memoized derivation: { version, lookup }. Recomputed when version moves. */
  derived: { version: number; lookup: PriceLookup } | null;
}

/**
 * Build the persisted (or plain, when persistence is unavailable) Electric
 * collection for the latest-prices shape. Mirrors the catalog helper: the
 * schema version is part of the URL so a bump invalidates the cached rows AND
 * the Electric resume point together, and the persisted variant pins
 * `schemaVersion` to the SAME shared constant.
 *
 * @returns The latest-prices collection.
 */
function createPricesShapeCollection(
  persistence: PersistedCollectionPersistence | null | undefined,
): PricesCollection {
  const electricOptions = electricCollectionOptions<LatestPriceShapeRow>({
    id: "catalog:latest-prices",
    shapeOptions: {
      // Public, unauthenticated, CDN-cacheable. Schema version in the URL for
      // the same resume-point-invalidation reason as the catalog shapes.
      url: `${globalThis.location.origin}/api/v1/public-shapes/latest-prices?v=${PERSISTED_SCHEMA_VERSION}`,
    },
    // One row per (printing, marketplace).
    getKey: (row) => `${row.printing_id}:${row.marketplace}`,
    // No onInsert/onUpdate/onDelete — prices are read-only.
  });
  return persistence
    ? (createCollection(
        persistedCollectionOptions<
          LatestPriceShapeRow,
          string | number,
          never,
          ElectricCollectionUtils<LatestPriceShapeRow>
        >({
          ...electricOptions,
          persistence,
          schemaVersion: PERSISTED_SCHEMA_VERSION,
        }),
      ) as unknown as PricesCollection)
    : createCollection(electricOptions);
}

// Stable no-op for the server-side `useSyncExternalStore` unsubscribe.
// oxlint-disable-next-line no-empty-function -- intentional no-op unsubscribe
const noop = (): void => {};

let entry: PricesStoreEntry | null = null;
let entryHasPersistence = false;

/**
 * The global prices store. Created once per page; if it was first created
 * before persistence settled, it is recreated once persistence resolves so the
 * rows persist to OPFS. Identity is otherwise stable for the page's lifetime.
 *
 * @returns The prices store entry.
 */
function getEntry(
  persistence: PersistedCollectionPersistence | null | undefined,
): PricesStoreEntry {
  // Recreate only to upgrade from no-persistence to persistence (the common
  // case: the first read happens before db-persistence has settled). Never
  // recreate once we already have a persistence handle.
  if (entry && entryHasPersistence) {
    return entry;
  }
  if (entry && !persistence) {
    return entry;
  }
  if (entry) {
    // Upgrade path: tear down the in-memory entry and rebuild persisted.
    for (const unsubscribe of entry.unsubscribes) {
      unsubscribe();
    }
  }

  const collection = createPricesShapeCollection(persistence);
  const created: PricesStoreEntry = {
    collection,
    version: 0,
    listeners: new Set(),
    unsubscribes: [],
    derived: null,
  };

  const notify = () => {
    created.version += 1;
    for (const listener of created.listeners) {
      listener();
    }
  };
  // `includeInitialState: false` (default) — we only need to know that the
  // snapshot moved; the data is read in bulk via `.toArray` on recompute.
  const subscription = collection.subscribeChanges(notify);
  created.unsubscribes.push(() => subscription.unsubscribe());

  entry = created;
  entryHasPersistence = Boolean(persistence);

  if (import.meta.env.DEV) {
    registerSyncDebug(created);
  }

  return created;
}

function registerSyncDebug(store: PricesStoreEntry): void {
  const existing = (globalThis as Record<string, unknown>).__openriftSyncDebug as
    | Record<string, unknown>
    | undefined;
  const pricesSummary = () => ({
    [store.collection.id]: { size: store.collection.size, status: store.collection.status },
  });
  if (existing) {
    // Augment the existing debug hook rather than clobbering it.
    const baseSummary = existing.summary as (() => Record<string, unknown>) | undefined;
    existing.prices = store.collection;
    existing.summary = () => ({ ...(baseSummary ? baseSummary() : {}), prices: pricesSummary() });
  } else {
    (globalThis as Record<string, unknown>).__openriftSyncDebug = {
      prices: store.collection,
      summary: () => ({ prices: pricesSummary() }),
    };
  }
}

/**
 * Whether the latest-prices shape has finished its initial sync — i.e. the
 * derived `PriceLookup` is trustworthy. `usePrices` only switches to the synced
 * path once this is true.
 *
 * @returns True when the prices collection is ready.
 */
function isEntryReady(store: PricesStoreEntry): boolean {
  return store.collection.isReady();
}

/**
 * Pivot the synced shape rows into a `PriceMap` and wrap it into a
 * `PriceLookup`, byte-equivalent to the edge `/prices` path's output. Memoized
 * on the store version so it recomputes only when the shape actually changes —
 * essentially once per daily price refresh, after the initial sync settles.
 *
 * @returns The derived `PriceLookup`.
 */
function derivePriceLookup(store: PricesStoreEntry): PriceLookup {
  if (store.derived && store.derived.version === store.version) {
    return store.derived.lookup;
  }

  const map: PriceMap = {};
  for (const row of store.collection.toArray) {
    let printingEntry = map[row.printing_id];
    if (!printingEntry) {
      printingEntry = {};
      map[row.printing_id] = printingEntry;
    }
    printingEntry[row.marketplace as Marketplace] = row.headline_cents;
  }

  const lookup = priceLookupFromMap(map);
  store.derived = { version: store.version, lookup };
  return lookup;
}

// ── Hook surface ─────────────────────────────────────────────────────────────

/**
 * The synced `PriceLookup`, or null until it is usable. Returns null on the
 * server, before hydration, while persistence is still settling, while the
 * initial sync is in flight, or in OPFS-less browsers that never reach a
 * persisted-ready state in time — in all those cases `usePrices` falls back to
 * the edge `/prices` path, byte-equivalent to before this feature.
 *
 * SSR-safe: the readiness subscription only ever fires in the browser, and the
 * server snapshot is a constant null.
 *
 * @returns The derived `PriceLookup`, or null when not yet ready.
 */
export function useSyncedPrices(): PriceLookup | null {
  const hydrated = useHydrated();
  const persistenceState = usePersistence();

  // Subscribe to the store's readiness/version so React re-renders when the
  // sync settles or prices later change. The subscribe callback creates the
  // store lazily (browser-only) and tears the subscription down on unmount.
  const synced = useSyncExternalStore(
    (onStoreChange) => {
      if (globalThis.window === undefined) {
        return noop;
      }
      const persistence =
        persistenceState.status === "ready" ? persistenceState.persistence : undefined;
      const store = getEntry(persistence);
      store.listeners.add(onStoreChange);
      return () => {
        store.listeners.delete(onStoreChange);
      };
    },
    () => {
      if (globalThis.window === undefined || entry === null || !isEntryReady(entry)) {
        return null;
      }
      return derivePriceLookup(entry);
    },
    () => null,
  );

  // Gate the synced path behind hydration and a settled persistence state — the
  // fallback (edge fetch) must stay byte-identical through SSR and first paint.
  if (!hydrated || persistenceState.status === "pending") {
    return null;
  }
  return synced;
}

/**
 * Test-only: reset the module singleton so each test starts fresh.
 *
 * @returns Nothing.
 */
export function resetPricesCollectionForTesting(): void {
  if (entry) {
    for (const unsubscribe of entry.unsubscribes) {
      unsubscribe();
    }
  }
  entry = null;
  entryHasPersistence = false;
}

/**
 * Test-only accessor for the underlying store (creates it if needed), so tests
 * can drive the sync pipeline directly without a React tree.
 *
 * @returns A handle exposing readiness and the derivation.
 */
export function getPricesStoreForTesting(
  persistence: PersistedCollectionPersistence | null | undefined,
): { isReady: () => boolean; derive: () => PriceLookup } {
  const store = getEntry(persistence);
  return {
    isReady: () => isEntryReady(store),
    derive: () => derivePriceLookup(store),
  };
}

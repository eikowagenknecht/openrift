// Copies collection (ADR-027 step 2): synced from Postgres through Electric
// shapes instead of refetched through the query layer. Two raw single-table
// shapes — the viewer's accessible copies and a narrow projection of their
// accessible collections — are joined client-side into a derived live-query
// view that keeps the pre-Electric `CopyResponse` row shape (camelCase plus
// `groupId`), so every consumer of `useCopiesCollection()` is unchanged.
//
// Reads: shape streams keep the raw collections current; there is no refetch
// path anywhere. Writes: mutations target the raw copies collection, whose
// onInsert/onUpdate/onDelete handlers call the existing Hono endpoints; each
// response carries the Postgres txid, and TanStack DB drops the optimistic
// overlay when that txid arrives back through the stream. Copy ids are
// generated client-side (uuidv7), so the optimistic row and the replicated
// row are the same row — no temp-id machinery.
//
// Collection identity is tied to (queryClient, userId): different users get
// different collection instances, segregating data by construction. On a user
// change the previous entry is evicted from the cache and `markOrphaned`
// instruments it so we can verify subscribers detach.

import type { CopyLink, CopyMetadataPatch, CopyResponse } from "@openrift/shared";
import { copiesContract } from "@openrift/shared/contracts";
import { ORPCError } from "@orpc/client";
import { persistedCollectionOptions } from "@tanstack/db-sqlite-persistence-core";
import type { PersistedCollectionPersistence } from "@tanstack/db-sqlite-persistence-core";
import { electricCollectionOptions } from "@tanstack/electric-db-collection";
import type { ElectricCollectionUtils, Txid } from "@tanstack/electric-db-collection";
import { IndexedDBAdapter, startOfflineExecutor } from "@tanstack/offline-transactions";
import type { OfflineConfig, OfflineExecutor } from "@tanstack/offline-transactions";
import {
  BasicIndex,
  coalesce,
  createCollection,
  createLiveQueryCollection,
  eq,
} from "@tanstack/react-db";
import type { Collection } from "@tanstack/react-db";
import { useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import { trackEvent } from "@/lib/analytics";
import { useSession } from "@/lib/auth-session";
import { cleanupWhenIdle, markOrphaned } from "@/lib/collection-cleanup";
import { createCollectionOfflineMutationFns } from "@/lib/collections-offline";
import type { CollectionShapeRow, CollectionsWriteCollection } from "@/lib/collections-offline";
import { usePersistence } from "@/lib/db-persistence";
import { createDeckOfflineMutationFns } from "@/lib/decks-offline";
import type { DeckCardShapeRow, DeckCardsWriteCollection } from "@/lib/decks-offline";
import { electricAuthenticatedFetch, electricShapeOrigin } from "@/lib/electric-origin";
import { createListOfflineMutationFns } from "@/lib/lists-offline";
import type {
  ListEntriesWriteCollection,
  ListEntryShapeRow,
  ListShapeRow,
  ListsWriteCollection,
} from "@/lib/lists-offline";
import { queryKeys } from "@/lib/query-keys";
import { browserApiOrpcClient } from "@/lib/server-fns/orpc-client";
import { asNonRetriableIfPermanent, rethrowAsNetworkError } from "@/lib/sync-mutation-helpers";
import { withTimeout } from "@/lib/with-timeout";

// Raw rows exactly as streamed from Postgres through Electric (snake_case
// column names; shapes are single-table and cannot rename or join). Type
// aliases, not interfaces: the Electric adapter's `T extends Row<unknown>`
// constraint needs the implicit index signature interfaces don't get.
// oxlint-disable-next-line typescript/consistent-type-definitions -- see above
export type CopyShapeRow = {
  id: string;
  collection_id: string;
  printing_id: string;
  // Per-copy metadata (ADR-038). The columns ride the shape so the derived
  // view carries the full CopyResponse and metadata edits sync live.
  condition: string | null;
  grader: string | null;
  grade: number | null;
  notes_public: string | null;
  notes_private: string | null;
  is_altered: boolean;
  links: CopyLink[];
};

/**
 * Row shape of the derived copies view: the pre-Electric `CopyResponse`
 * contract plus `synced` — false while the row is an optimistic overlay whose
 * write hasn't round-tripped through the server yet. Copy ids are real uuids
 * from the moment of insertion, so `synced` is the only way to tell an
 * in-flight row apart; dispose/move targeting must skip unsynced rows or the
 * API 404s on ids the server doesn't know yet (the old temp-id guard).
 */
export type CopyViewRow = CopyResponse & { synced: boolean };

// Version of the row shapes as stored in the local SQLite cache. Bump when
// ANY persisted shape's columns change; a mismatch clears that table and
// re-syncs from the server.
//
// ONE version for ALL persisted collections in the database — never give two
// collections different versions. The browser persistence coordinator has a
// single adapter slot shared by every collection (`setAdapter` in
// @tanstack/browser-db-sqlite-persistence — last resolved collection wins),
// and each adapter is constructed for one schema version. With diverging
// versions, any coordinator-routed operation for the other collection sees a
// registry mismatch and silently wipes that collection's rows (while its
// Electric resume point survives, suppressing the refetch — a permanently
// empty collection). v3: single shared version replacing copies@2 +
// collections-meta@1, healing caches the divergence corrupted. v4: the
// collections shape widened from {id, group_id} to carry name, description,
// is_inbox, and sort_order for the synced collections UI (ADR-027 collections
// vertical). The lists/list-entries and deck-cards shapes joined at v4 — a
// NEW shape never needs a bump (its table starts empty), only widening an
// already-shipped shape's columns does. v5: the rebase onto post-ADR-037 main
// widened the catalog printings shape with `size`, the card-bans/card-errata
// shapes with their `id` primary key (Electric rejects a shape whose column
// list omits the PK, so both had synced empty), and the copies shape with the
// ADR-038 per-copy metadata columns.
//
// Exported so the public catalog collections (catalog-collection.ts) reuse the
// SAME version — they share the one persistence coordinator + adapter slot, and
// diverging the version would silently cross-wipe these collections' rows.
export const PERSISTED_SCHEMA_VERSION = 5;

// The API caps copy mutations at 500 ids/rows per request.
const BATCH_SIZE = 500;

export type CopiesWriteCollection = Collection<
  CopyShapeRow,
  string | number,
  ElectricCollectionUtils<CopyShapeRow>
>;

interface CacheEntry {
  userId: string;
  copiesShape: CopiesWriteCollection;
  collectionsShape: CollectionsWriteCollection;
  listsShape: ListsWriteCollection;
  listEntriesShape: ListEntriesWriteCollection;
  deckCardsShape: DeckCardsWriteCollection;
  view: Collection<CopyViewRow, string | number>;
  executor: OfflineExecutor;
}

const cache = new WeakMap<QueryClient, CacheEntry>();

function chunks<T>(array: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

// ── Mutation API calls ──────────────────────────────────────────────────────
//
// All three run entirely client-side: a direct oRPC call to the copies endpoint
// with an AbortController so the timeout can actually cancel the in-flight
// request. Each returns the Postgres txid of its transaction, which the
// collection handlers hand to TanStack DB for Electric-stream matching.

async function addCopiesRequest(rows: CopyShapeRow[], signal: AbortSignal): Promise<Txid> {
  try {
    const { txid } = await browserApiOrpcClient(copiesContract).add(
      {
        copies: rows.map((row) => ({
          id: row.id,
          printingId: row.printing_id,
          collectionId: row.collection_id,
          condition: row.condition,
          grader: row.grader,
          grade: row.grade,
          notesPublic: row.notes_public,
          notesPrivate: row.notes_private,
          isAltered: row.is_altered,
          links: row.links,
        })),
      },
      { signal },
    );
    return txid;
  } catch (error) {
    rethrowAsNetworkError(error);
  }
}

async function updateCopiesRequest(
  copyIds: string[],
  patch: CopyMetadataPatch,
  signal: AbortSignal,
): Promise<Txid> {
  try {
    const { txid } = await browserApiOrpcClient(copiesContract).update(
      { copyIds, patch },
      { signal },
    );
    return txid;
  } catch (error) {
    rethrowAsNetworkError(error);
  }
}

// The metadata slice of a shape-row diff, mapped back to the camelCase patch
// the API takes. Non-metadata columns (collection_id moves) are ignored.
function metadataPatchFromChanges(changes: Partial<CopyShapeRow>): CopyMetadataPatch {
  const patch: CopyMetadataPatch = {};
  if ("condition" in changes) {
    patch.condition = changes.condition;
  }
  if ("grader" in changes) {
    patch.grader = changes.grader;
  }
  if ("grade" in changes) {
    patch.grade = changes.grade;
  }
  if ("notes_public" in changes) {
    patch.notesPublic = changes.notes_public;
  }
  if ("notes_private" in changes) {
    patch.notesPrivate = changes.notes_private;
  }
  if ("is_altered" in changes) {
    patch.isAltered = changes.is_altered;
  }
  if ("links" in changes) {
    patch.links = changes.links;
  }
  return patch;
}

async function moveCopiesRequest(
  copyIds: string[],
  toCollectionId: string,
  signal: AbortSignal,
): Promise<Txid> {
  try {
    const { txid } = await browserApiOrpcClient(copiesContract).move(
      { copyIds, toCollectionId },
      { signal },
    );
    return txid;
  } catch (error) {
    rethrowAsNetworkError(error);
  }
}

async function disposeCopiesRequest(copyIds: string[], signal: AbortSignal): Promise<Txid> {
  try {
    const { txid } = await browserApiOrpcClient(copiesContract).dispose({ copyIds }, { signal });
    return txid;
  } catch (error) {
    rethrowAsNetworkError(error);
  }
}

// Refetch the collections list after any copy mutation so the header's
// totalValueCents / unpricedCopyCount catch up. copyCount is already live
// (derived from the copies view in useCollections), but value totals are
// computed server-side via joins to the price table.
function invalidateCollectionTotals(queryClient: QueryClient, userId: string): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.collections.all(userId) });
}

// The slice of a TanStack DB mutation the copy mutation functions actually
// read. Narrow on purpose so tests can drive them with plain objects.
export interface CopyMutationLike {
  key: string | number;
  modified: CopyShapeRow;
  /** The changed columns only — how `updateCopies` reconstructs the patch. */
  changes?: Partial<CopyShapeRow>;
}

/**
 * The three named mutation functions the offline executor replays from its
 * outbox (ADR-027 step 3), extracted so they can be unit-tested without
 * standing up the executor. Each POSTs the change to the existing Hono
 * endpoint (chunked to the API's 500-row cap), awaits the returned Postgres
 * txids on the Electric stream so the optimistic overlay holds until the
 * synced rows arrive, and refreshes the server-derived collection totals.
 *
 * Replay tolerance — a retried transaction may have partially landed before
 * its response was lost, so every function must converge when run twice:
 * adds answer 409 for rows that already exist ("already applied"), moves are
 * naturally idempotent, disposes answer 404 when the copies are already gone
 * (the desired end state). Other 4xx responses become NonRetriableError so
 * the outbox drops the transaction and rolls back its optimistic state.
 *
 * @returns Named mutation functions for `startOfflineExecutor`.
 */
export function createCopyOfflineMutationFns(
  queryClient: QueryClient,
  userId: string,
  collection: CopiesWriteCollection,
) {
  // The server has already committed when a txid is awaited — a lagging
  // stream must not fail (and re-run) the transaction, so timeouts are
  // swallowed and the stream converges on its own.
  const awaitTxidsBestEffort = async (txids: Txid[]) => {
    try {
      await Promise.all(txids.map((txid) => collection.utils.awaitTxId(txid)));
    } catch {
      // Stream lag; the rows arrive momentarily.
    }
  };

  return {
    addCopies: async ({ transaction }: { transaction: { mutations: CopyMutationLike[] } }) => {
      const rows = transaction.mutations.map((mutation) => mutation.modified);
      const txids: Txid[] = [];
      for (const batch of chunks(rows, BATCH_SIZE)) {
        const controller = new AbortController();
        try {
          txids.push(
            await withTimeout(addCopiesRequest(batch, controller.signal), {
              label: "Add copies",
              abortController: controller,
            }),
          );
        } catch (error) {
          if (error instanceof ORPCError && error.status === 409) {
            // Replay of a batch whose first attempt landed (client-generated
            // ids make the insert idempotent) — already applied.
            continue;
          }
          throw asNonRetriableIfPermanent(error);
        }
      }
      await awaitTxidsBestEffort(txids);
      invalidateCollectionTotals(queryClient, userId);
      trackEvent("collection-add", { count: rows.length });
    },
    moveCopies: async ({ transaction }: { transaction: { mutations: CopyMutationLike[] } }) => {
      // The only updatable field is collection_id (a move). One request per
      // target collection — in practice a move targets a single collection.
      const byTarget = Map.groupBy(transaction.mutations, (mutation) =>
        String(mutation.modified.collection_id),
      );
      const txids: Txid[] = [];
      for (const [toCollectionId, mutations] of byTarget) {
        const ids = mutations.map((mutation) => String(mutation.key));
        for (const batch of chunks(ids, BATCH_SIZE)) {
          const controller = new AbortController();
          try {
            txids.push(
              await withTimeout(moveCopiesRequest(batch, toCollectionId, controller.signal), {
                label: "Move copies",
                abortController: controller,
              }),
            );
          } catch (error) {
            // 404 (copies vanished elsewhere) is included: the move is
            // permanently unapplicable, the rollback restores stream truth.
            throw asNonRetriableIfPermanent(error);
          }
        }
      }
      await awaitTxidsBestEffort(txids);
      invalidateCollectionTotals(queryClient, userId);
    },
    updateCopies: async ({ transaction }: { transaction: { mutations: CopyMutationLike[] } }) => {
      // One dialog submit patches N copies with one patch, but group by the
      // reconstructed patch anyway so a replayed mixed transaction stays
      // correct. Metadata patches are idempotent, so replays need no special
      // 4xx tolerance beyond the shared permanent-error handling.
      const byPatch = Map.groupBy(transaction.mutations, (mutation) =>
        JSON.stringify(metadataPatchFromChanges(mutation.changes ?? {})),
      );
      const txids: Txid[] = [];
      for (const [patchKey, mutations] of byPatch) {
        const patch = JSON.parse(patchKey) as CopyMetadataPatch;
        if (Object.keys(patch).length === 0) {
          continue;
        }
        const ids = mutations.map((mutation) => String(mutation.key));
        for (const batch of chunks(ids, BATCH_SIZE)) {
          const controller = new AbortController();
          try {
            txids.push(
              await withTimeout(updateCopiesRequest(batch, patch, controller.signal), {
                label: "Update copies",
                abortController: controller,
              }),
            );
          } catch (error) {
            // Includes 404 (copies vanished elsewhere) and 400 (unknown
            // condition/grader): permanent, roll back the optimistic patch.
            throw asNonRetriableIfPermanent(error);
          }
        }
      }
      await awaitTxidsBestEffort(txids);
    },
    disposeCopies: async ({ transaction }: { transaction: { mutations: CopyMutationLike[] } }) => {
      const ids = transaction.mutations.map((mutation) => String(mutation.key));
      const txids: Txid[] = [];
      for (const batch of chunks(ids, BATCH_SIZE)) {
        const controller = new AbortController();
        try {
          txids.push(
            await withTimeout(disposeCopiesRequest(batch, controller.signal), {
              label: "Dispose copies",
              abortController: controller,
            }),
          );
        } catch (error) {
          if (error instanceof ORPCError && error.status === 404) {
            // The copies are already gone — the desired end state (replay of
            // a landed dispose, or disposed from another device).
            continue;
          }
          // Includes 409 CONFLICT (trade-reserved): permanent refusal, the
          // rollback makes the reserved copy reappear.
          throw asNonRetriableIfPermanent(error);
        }
      }
      await awaitTxidsBestEffort(txids);
      invalidateCollectionTotals(queryClient, userId);
      trackEvent("collection-remove", { count: ids.length });
    },
  };
}

function createCopiesShapeCollection(
  userId: string,
  persistence?: PersistedCollectionPersistence | null,
): CopiesWriteCollection {
  const electricOptions = electricCollectionOptions<CopyShapeRow>({
    id: `copies:${userId}`,
    shapeOptions: {
      // Same-origin: cookies flow automatically and the API proxy scopes the
      // shape to the session user (see apps/api/src/routes/authenticated/shapes.ts).
      //
      // The schema version is part of the URL on purpose. Electric persists
      // its resume point (offset + handle) in collection metadata keyed by
      // shape identity (url + params), and that metadata survives the
      // persisted table's schema-mismatch reset. Without the version in the
      // identity, a schema bump wipes the locally cached rows but the stream
      // still resumes past them, leaving the collection permanently empty.
      // With it, the bump also invalidates the resume point and forces a full
      // refetch. The proxy ignores the parameter.
      url: `${electricShapeOrigin()}/api/v1/shapes/copies?v=${PERSISTED_SCHEMA_VERSION}`,
      fetchClient: electricAuthenticatedFetch,
    },
    getKey: (row) => row.id,
    // No onInsert/onUpdate/onDelete: every write goes through the offline
    // executor's named mutation functions (ADR-027 step 3), so the change is
    // durably queued before it is dispatched.
  });

  // Explicit type arguments: inference from the spread widens T to
  // Record<string, unknown> and TSchema to StandardSchemaV1<unknown, unknown>,
  // which no createCollection overload accepts. TUtils must name the Electric
  // utils or the spread handlers' params fail the default UtilsRecord.
  return persistence
    ? (createCollection(
        persistedCollectionOptions<
          CopyShapeRow,
          string | number,
          never,
          ElectricCollectionUtils<CopyShapeRow>
        >({
          ...electricOptions,
          persistence,
          schemaVersion: PERSISTED_SCHEMA_VERSION,
        }),
      ) as unknown as CopiesWriteCollection)
    : createCollection(electricOptions);
}

function createCollectionsShapeCollection(
  userId: string,
  persistence?: PersistedCollectionPersistence | null,
): CollectionsWriteCollection {
  const electricOptions = electricCollectionOptions<CollectionShapeRow>({
    id: `collections-meta:${userId}`,
    shapeOptions: {
      // Schema version in the URL for the same resume-point-invalidation
      // reason as the copies shape above.
      url: `${electricShapeOrigin()}/api/v1/shapes/collections?v=${PERSISTED_SCHEMA_VERSION}`,
      fetchClient: electricAuthenticatedFetch,
    },
    getKey: (row) => row.id,
    // No onInsert/onUpdate/onDelete: collection CRUD goes through the offline
    // executor's named mutation functions (collections-offline.ts), so the
    // change is durably queued before it is dispatched.
  });
  return persistence
    ? (createCollection(
        persistedCollectionOptions<
          CollectionShapeRow,
          string | number,
          never,
          ElectricCollectionUtils<CollectionShapeRow>
        >({
          ...electricOptions,
          persistence,
          schemaVersion: PERSISTED_SCHEMA_VERSION,
        }),
      ) as unknown as CollectionsWriteCollection)
    : createCollection(electricOptions);
}

function createListsShapeCollection(
  userId: string,
  persistence?: PersistedCollectionPersistence | null,
): ListsWriteCollection {
  const electricOptions = electricCollectionOptions<ListShapeRow>({
    id: `lists:${userId}`,
    shapeOptions: {
      // Schema version in the URL for the same resume-point-invalidation
      // reason as the copies shape above.
      url: `${electricShapeOrigin()}/api/v1/shapes/lists?v=${PERSISTED_SCHEMA_VERSION}`,
      fetchClient: electricAuthenticatedFetch,
    },
    getKey: (row) => row.id,
    // No onInsert/onUpdate/onDelete: list CRUD goes through the offline
    // executor's named mutation functions (lists-offline.ts), so the change
    // is durably queued before it is dispatched.
  });
  return persistence
    ? (createCollection(
        persistedCollectionOptions<
          ListShapeRow,
          string | number,
          never,
          ElectricCollectionUtils<ListShapeRow>
        >({
          ...electricOptions,
          persistence,
          schemaVersion: PERSISTED_SCHEMA_VERSION,
        }),
      ) as unknown as ListsWriteCollection)
    : createCollection(electricOptions);
}

function createListEntriesShapeCollection(
  userId: string,
  persistence?: PersistedCollectionPersistence | null,
): ListEntriesWriteCollection {
  const electricOptions = electricCollectionOptions<ListEntryShapeRow>({
    id: `list-entries:${userId}`,
    shapeOptions: {
      // Schema version in the URL for the same resume-point-invalidation
      // reason as the copies shape above.
      url: `${electricShapeOrigin()}/api/v1/shapes/list-entries?v=${PERSISTED_SCHEMA_VERSION}`,
      fetchClient: electricAuthenticatedFetch,
    },
    getKey: (row) => row.id,
    // No onInsert/onUpdate/onDelete: entry mutations go through the offline
    // executor's named mutation functions (lists-offline.ts), so the change
    // is durably queued before it is dispatched.
  });
  return persistence
    ? (createCollection(
        persistedCollectionOptions<
          ListEntryShapeRow,
          string | number,
          never,
          ElectricCollectionUtils<ListEntryShapeRow>
        >({
          ...electricOptions,
          persistence,
          schemaVersion: PERSISTED_SCHEMA_VERSION,
        }),
      ) as unknown as ListEntriesWriteCollection)
    : createCollection(electricOptions);
}

function createDeckCardsShapeCollection(
  userId: string,
  persistence?: PersistedCollectionPersistence | null,
): DeckCardsWriteCollection {
  const electricOptions = electricCollectionOptions<DeckCardShapeRow>({
    id: `deck-cards:${userId}`,
    shapeOptions: {
      // Schema version in the URL for the same resume-point-invalidation
      // reason as the copies shape above.
      url: `${electricShapeOrigin()}/api/v1/shapes/deck-cards?v=${PERSISTED_SCHEMA_VERSION}`,
      fetchClient: electricAuthenticatedFetch,
    },
    getKey: (row) => row.id,
    // No onInsert/onUpdate/onDelete: deck-card edits go through the offline
    // executor's named mutation function (decks-offline.ts), so the change is
    // durably queued before it is dispatched.
  });
  return persistence
    ? (createCollection(
        persistedCollectionOptions<
          DeckCardShapeRow,
          string | number,
          never,
          ElectricCollectionUtils<DeckCardShapeRow>
        >({
          ...electricOptions,
          persistence,
          schemaVersion: PERSISTED_SCHEMA_VERSION,
        }),
      ) as unknown as DeckCardsWriteCollection)
    : createCollection(electricOptions);
}

function createEntry(
  queryClient: QueryClient,
  userId: string,
  persistence?: PersistedCollectionPersistence | null,
): CacheEntry {
  const copiesShape = createCopiesShapeCollection(userId, persistence);
  const collectionsShape = createCollectionsShapeCollection(userId, persistence);
  const listsShape = createListsShapeCollection(userId, persistence);
  const listEntriesShape = createListEntriesShapeCollection(userId, persistence);
  const deckCardsShape = createDeckCardsShapeCollection(userId, persistence);

  // The durable write path (ADR-027 step 3): mutations persist to a per-user
  // IndexedDB outbox before dispatch, replay FIFO across reloads and offline
  // periods, and retry with backoff. The registry keys ("copies",
  // "collections", "lists", "listEntries") are what outbox records reference,
  // so they must stay stable across sessions; the per-user database name
  // keeps one account's queued writes from ever replaying for another.
  const executor = startOfflineExecutor({
    collections: {
      copies: copiesShape,
      collections: collectionsShape,
      lists: listsShape,
      listEntries: listEntriesShape,
      deckCards: deckCardsShape,
    },
    // The functions take a structurally-narrowed transaction (so tests can
    // drive them with plain objects); the executor calls them with the full
    // TanStack DB params, which satisfy that shape.
    mutationFns: {
      ...createCopyOfflineMutationFns(queryClient, userId, copiesShape),
      ...createCollectionOfflineMutationFns(queryClient, userId, collectionsShape),
      ...createListOfflineMutationFns(queryClient, userId, listsShape, listEntriesShape),
      ...createDeckOfflineMutationFns(queryClient, userId, deckCardsShape),
    } as unknown as OfflineConfig["mutationFns"],
    storage: new IndexedDBAdapter(`openrift-outbox-${userId}`, "transactions"),
  });

  // Index the collections shape on `id` before the view joins on it: without
  // an index, the live-query leftJoin falls back to a full scan of the
  // collections shape per copy row — O(copies × collections) on every initial
  // sync and every collections change.
  collectionsShape.createIndex((row) => row.id, { indexType: BasicIndex });

  // The derived view: raw copies joined with the collections projection,
  // shaped exactly like the old `CopyResponse` feed. Left join so a copy
  // whose collection row hasn't synced yet renders with groupId null instead
  // of vanishing (matches the old optimistic-guess behavior).
  const view = createLiveQueryCollection({
    id: `copies-view:${userId}`,
    query: (q) =>
      q
        .from({ copy: copiesShape })
        .leftJoin({ col: collectionsShape }, ({ copy, col }) => eq(copy.collection_id, col.id))
        .select(({ copy, col }) => ({
          id: copy.id,
          printingId: copy.printing_id,
          collectionId: copy.collection_id,
          groupId: coalesce(col.group_id, null),
          condition: copy.condition,
          grader: copy.grader,
          grade: copy.grade,
          notesPublic: copy.notes_public,
          notesPrivate: copy.notes_private,
          isAltered: copy.is_altered,
          links: copy.links,
          synced: copy.$synced,
        })),
    getKey: (row) => row.id,
  }) as unknown as Collection<CopyViewRow, string | number>;

  if (import.meta.env.DEV) {
    // Dev-only diagnostics: run `__openriftSyncDebug.summary()` in the
    // browser console to see which layer of the sync pipeline holds data,
    // and `await __openriftSyncDebug.dump()` to read the persisted SQLite
    // state (stored row counts, sync metadata, stream positions) directly.
    // Resolve the adapter the same way the persisted collections do — the
    // top-level `persistence.adapter` is a default-version instance whose
    // schema check would reject (or worse, reset) our registry entries.
    const resolved = (
      persistence as unknown as
        | {
            resolvePersistenceForCollection?: (options: {
              mode: string;
              schemaVersion: number;
            }) => { adapter: unknown };
          }
        | null
        | undefined
    )?.resolvePersistenceForCollection?.({ mode: "sync", schemaVersion: PERSISTED_SCHEMA_VERSION });
    const adapter = (resolved?.adapter ?? persistence?.adapter) as unknown as
      | {
          scanRows?: (id: string) => Promise<unknown[]>;
          loadCollectionMetadata?: (id: string) => Promise<unknown[]>;
          getStreamPosition?: (id: string) => Promise<unknown>;
        }
      | undefined;
    const dumpOne = async (id: string) => {
      const storedRows = await adapter?.scanRows?.(id);
      return {
        id,
        storedRows: storedRows?.length,
        metadata: await adapter?.loadCollectionMetadata?.(id),
        streamPosition: await adapter?.getStreamPosition?.(id),
      };
    };
    (globalThis as Record<string, unknown>).__openriftSyncDebug = {
      copiesShape,
      collectionsShape,
      listsShape,
      listEntriesShape,
      deckCardsShape,
      view,
      summary: () => ({
        copies: { size: copiesShape.size, status: copiesShape.status },
        collectionsMeta: { size: collectionsShape.size, status: collectionsShape.status },
        lists: { size: listsShape.size, status: listsShape.status },
        listEntries: { size: listEntriesShape.size, status: listEntriesShape.status },
        deckCards: { size: deckCardsShape.size, status: deckCardsShape.status },
        view: { size: view.size, status: view.status },
      }),
      dump: async () => ({
        copies: await dumpOne(`copies:${userId}`),
        collectionsMeta: await dumpOne(`collections-meta:${userId}`),
        lists: await dumpOne(`lists:${userId}`),
        listEntries: await dumpOne(`list-entries:${userId}`),
        deckCards: await dumpOne(`deck-cards:${userId}`),
      }),
      wipe: async () => {
        const { wipePersistedData } = await import("@/lib/db-persistence");
        await wipePersistedData();
        return "wiped — reload to resync from scratch";
      },
    };
  }

  return {
    userId,
    copiesShape,
    collectionsShape,
    listsShape,
    listEntriesShape,
    deckCardsShape,
    view,
    executor,
  };
}

function getEntry(
  queryClient: QueryClient,
  userId: string,
  persistence?: PersistedCollectionPersistence | null,
): CacheEntry {
  const existing = cache.get(queryClient);
  if (existing && existing.userId === userId) {
    return existing;
  }
  if (existing) {
    orphanEntry(existing);
  }
  const entry = createEntry(queryClient, userId, persistence);
  cache.set(queryClient, entry);
  return entry;
}

function orphanEntry(entry: CacheEntry): void {
  // View first (its subscribers detach before the sources it reads from),
  // then the raw shapes.
  markOrphaned(entry.view, `copies-view:${entry.userId}`);
  markOrphaned(entry.copiesShape, `copies:${entry.userId}`);
  markOrphaned(entry.collectionsShape, `collections-meta:${entry.userId}`);
  markOrphaned(entry.listsShape, `lists:${entry.userId}`);
  markOrphaned(entry.listEntriesShape, `list-entries:${entry.userId}`);
  markOrphaned(entry.deckCardsShape, `deck-cards:${entry.userId}`);
  // Stop the outbox machinery for the departing user. Queued writes stay
  // durable in their per-user database and resume on that user's next
  // sign-in; teardown must never block a user switch.
  try {
    entry.executor.dispose();
  } catch (error) {
    console.warn("Failed to dispose the copies offline executor:", error);
  }
}

/**
 * The current user's copies in the synced-store contract every consumer was
 * built against: `CopyResponse` rows (camelCase, including `groupId`).
 * Read-only — mutations go through the hooks in use-copies.ts.
 *
 * @returns The derived copies view collection for this (queryClient, user).
 */
export function getCopiesCollection(
  queryClient: QueryClient,
  userId: string,
  persistence?: PersistedCollectionPersistence | null,
): Collection<CopyViewRow, string | number> {
  return getEntry(queryClient, userId, persistence).view;
}

/**
 * Sign-out / account deletion: drop the cached collections (if any) and tear
 * them down as soon as their last subscriber detaches, so the shape streams
 * and persistence machinery stop before the locally persisted rows are wiped
 * (see `wipePersistedData`). Unlike the orphaning on user change, this also
 * schedules an eager cleanup — there is no next user yet to displace them,
 * and waiting for auto-GC would leave the machinery running for minutes.
 *
 * @returns Nothing.
 */
export function releaseCopiesCollection(queryClient: QueryClient): void {
  const existing = cache.get(queryClient);
  if (!existing) {
    return;
  }
  cache.delete(queryClient);
  // Unsynced queued writes belong to the account that just left and must not
  // outlive it on a shared machine — same rationale as `wipePersistedData`.
  // Fire-and-forget: a failed clear must never break the sign-out flow.
  void (async () => {
    try {
      await existing.executor.clearOutbox();
    } catch (error) {
      console.warn("Failed to clear the copies outbox:", error);
    }
  })();
  orphanEntry(existing);
  cleanupWhenIdle(existing.view);
  cleanupWhenIdle(existing.copiesShape);
  cleanupWhenIdle(existing.collectionsShape);
  cleanupWhenIdle(existing.listsShape);
  cleanupWhenIdle(existing.listEntriesShape);
  cleanupWhenIdle(existing.deckCardsShape);
}

/**
 * Hook variant: derives the active userId from the session and returns the
 * current user's copies view collection, or null when no one is signed in.
 *
 * Also null while browser persistence is still initializing (a few dozen
 * milliseconds after hydration, and never on the server): the collection is
 * created exactly once per (queryClient, userId), so we must know whether it
 * is persisted before creating it. Consumers already handle null (the
 * signed-out case), so this only delays the first live-query subscription.
 *
 * Live-query consumers should pass the result into the live-query body and
 * include it in their dependency array — when the collection identity
 * changes (sign-in / sign-out / verify-email), the live query re-subscribes.
 *
 * @returns The current user's copies view collection, or null when signed out
 *   or while persistence is initializing.
 */
export function useCopiesCollection(): Collection<CopyViewRow, string | number> | null {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const persistenceState = usePersistence();
  const userId = session?.user?.id ?? null;
  return useMemo(() => {
    if (!userId || persistenceState.status === "pending") {
      return null;
    }
    return getCopiesCollection(queryClient, userId, persistenceState.persistence);
  }, [queryClient, userId, persistenceState]);
}

/** Everything the mutation hooks need to issue a durable write. */
export interface CopiesWriter {
  /** The raw synced copies collection (snake_case shape rows). */
  collection: CopiesWriteCollection;
  /** The offline executor whose named mutation functions dispatch writes. */
  executor: OfflineExecutor;
}

/**
 * Hook: the write path for copies — the raw shape collection plus the
 * offline executor that durably queues and dispatches mutations.
 * Same null semantics as {@link useCopiesCollection}.
 *
 * @returns The writer, or null when signed out or while persistence is
 *   initializing.
 */
export function useCopiesWriter(): CopiesWriter | null {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const persistenceState = usePersistence();
  const userId = session?.user?.id ?? null;
  return useMemo(() => {
    if (!userId || persistenceState.status === "pending") {
      return null;
    }
    const entry = getEntry(queryClient, userId, persistenceState.persistence);
    return { collection: entry.copiesShape, executor: entry.executor };
  }, [queryClient, userId, persistenceState]);
}

/**
 * The raw synced collections shape for the given (queryClient, user) — same
 * cache entry as the copies view, so reads and writes share one stream and
 * one executor. Consumers use the hooks below.
 *
 * @returns The raw collections shape collection.
 */
function getCollectionsShapeCollection(
  queryClient: QueryClient,
  userId: string,
  persistence?: PersistedCollectionPersistence | null,
): CollectionsWriteCollection {
  return getEntry(queryClient, userId, persistence).collectionsShape;
}

/**
 * Hook: the current user's synced collections shape (raw snake_case rows:
 * id, group_id, name, description, is_inbox, sort_order), or null when
 * signed out or while persistence is initializing. Read path for
 * `useCollections`; same null semantics as {@link useCopiesCollection}.
 *
 * @returns The raw collections shape collection, or null.
 */
export function useSyncedCollections(): CollectionsWriteCollection | null {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const persistenceState = usePersistence();
  const userId = session?.user?.id ?? null;
  return useMemo(() => {
    if (!userId || persistenceState.status === "pending") {
      return null;
    }
    return getCollectionsShapeCollection(queryClient, userId, persistenceState.persistence);
  }, [queryClient, userId, persistenceState]);
}

/** Everything the collection mutation hooks need to issue a durable write. */
export interface CollectionsWriter {
  /** The raw synced collections shape (snake_case rows). */
  collection: CollectionsWriteCollection;
  /** The offline executor whose named mutation functions dispatch writes. */
  executor: OfflineExecutor;
}

/**
 * Hook: the write path for collections — the raw shape collection plus the
 * shared offline executor that durably queues and dispatches mutations.
 * Same null semantics as {@link useCopiesCollection}.
 *
 * @returns The writer, or null when signed out or while persistence is
 *   initializing.
 */
export function useCollectionsWriter(): CollectionsWriter | null {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const persistenceState = usePersistence();
  const userId = session?.user?.id ?? null;
  return useMemo(() => {
    if (!userId || persistenceState.status === "pending") {
      return null;
    }
    const entry = getEntry(queryClient, userId, persistenceState.persistence);
    return { collection: entry.collectionsShape, executor: entry.executor };
  }, [queryClient, userId, persistenceState]);
}

/**
 * The raw synced lists shape for the given (queryClient, user) — same cache
 * entry as the copies view, so reads and writes share one stream and one
 * executor. Exposed primarily for tests; consumers use the hooks below.
 *
 * @returns The raw lists shape collection.
 */
export function getListsShapeCollection(
  queryClient: QueryClient,
  userId: string,
  persistence?: PersistedCollectionPersistence | null,
): ListsWriteCollection {
  return getEntry(queryClient, userId, persistence).listsShape;
}

/**
 * The raw synced list-entries shape for the given (queryClient, user) — same
 * cache entry as the copies view. Exposed primarily for tests; consumers use
 * the hooks below.
 *
 * @returns The raw list-entries shape collection.
 */
export function getListEntriesShapeCollection(
  queryClient: QueryClient,
  userId: string,
  persistence?: PersistedCollectionPersistence | null,
): ListEntriesWriteCollection {
  return getEntry(queryClient, userId, persistence).listEntriesShape;
}

/**
 * Hook: the current user's synced lists shape (raw snake_case rows: id,
 * name, intent, kind, trade defaults, currency, sort_order), or null when
 * signed out or while persistence is initializing. Read path for `useLists` /
 * `useListDetail`; same null semantics as {@link useCopiesCollection}.
 *
 * @returns The raw lists shape collection, or null.
 */
export function useSyncedLists(): ListsWriteCollection | null {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const persistenceState = usePersistence();
  const userId = session?.user?.id ?? null;
  return useMemo(() => {
    if (!userId || persistenceState.status === "pending") {
      return null;
    }
    return getListsShapeCollection(queryClient, userId, persistenceState.persistence);
  }, [queryClient, userId, persistenceState]);
}

/**
 * Hook: the current user's synced list-entries shape (raw snake_case rows:
 * id, list_id, kind, target ids, quantity, trade override), or null when
 * signed out or while persistence is initializing. Same null semantics as
 * {@link useCopiesCollection}.
 *
 * @returns The raw list-entries shape collection, or null.
 */
export function useSyncedListEntries(): ListEntriesWriteCollection | null {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const persistenceState = usePersistence();
  const userId = session?.user?.id ?? null;
  return useMemo(() => {
    if (!userId || persistenceState.status === "pending") {
      return null;
    }
    return getListEntriesShapeCollection(queryClient, userId, persistenceState.persistence);
  }, [queryClient, userId, persistenceState]);
}

/** Everything the list mutation hooks need to issue a durable write. */
export interface ListsWriter {
  /** The raw synced lists shape (snake_case rows). */
  lists: ListsWriteCollection;
  /** The raw synced list-entries shape (snake_case rows). */
  listEntries: ListEntriesWriteCollection;
  /** The offline executor whose named mutation functions dispatch writes. */
  executor: OfflineExecutor;
}

/**
 * Hook: the write path for lists — both raw shape collections plus the
 * shared offline executor that durably queues and dispatches mutations.
 * Same null semantics as {@link useCopiesCollection}.
 *
 * @returns The writer, or null when signed out or while persistence is
 *   initializing.
 */
export function useListsWriter(): ListsWriter | null {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const persistenceState = usePersistence();
  const userId = session?.user?.id ?? null;
  return useMemo(() => {
    if (!userId || persistenceState.status === "pending") {
      return null;
    }
    const entry = getEntry(queryClient, userId, persistenceState.persistence);
    return {
      lists: entry.listsShape,
      listEntries: entry.listEntriesShape,
      executor: entry.executor,
    };
  }, [queryClient, userId, persistenceState]);
}

/**
 * The raw synced deck-cards shape for the given (queryClient, user) — same
 * cache entry as the copies view, so reads and writes share one stream and
 * one executor. Exposed primarily for tests; consumers use the hooks below.
 *
 * @returns The raw deck-cards shape collection.
 */
export function getDeckCardsShapeCollection(
  queryClient: QueryClient,
  userId: string,
  persistence?: PersistedCollectionPersistence | null,
): DeckCardsWriteCollection {
  return getEntry(queryClient, userId, persistence).deckCardsShape;
}

/**
 * Hook: the current user's synced deck-cards shape (raw snake_case rows: id,
 * deck_id, card_id, zone, quantity, preferred_printing_id), or null when
 * signed out or while persistence is initializing. Read path for
 * `useDeckCards`; same null semantics as {@link useCopiesCollection}.
 *
 * @returns The raw deck-cards shape collection, or null.
 */
export function useSyncedDeckCards(): DeckCardsWriteCollection | null {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const persistenceState = usePersistence();
  const userId = session?.user?.id ?? null;
  return useMemo(() => {
    if (!userId || persistenceState.status === "pending") {
      return null;
    }
    return getDeckCardsShapeCollection(queryClient, userId, persistenceState.persistence);
  }, [queryClient, userId, persistenceState]);
}

/** Everything the deck-builder write path needs to issue a durable write. */
export interface DecksWriter {
  /** The signed-in user the writer belongs to (scopes save-status keys). */
  userId: string;
  /** The raw synced deck-cards shape (snake_case rows). */
  deckCards: DeckCardsWriteCollection;
  /** The offline executor whose named mutation function dispatches writes. */
  executor: OfflineExecutor;
}

/**
 * Hook: the write path for deck cards — the raw shape collection plus the
 * shared offline executor that durably queues and dispatches mutations.
 * Same null semantics as {@link useCopiesCollection}.
 *
 * @returns The writer, or null when signed out or while persistence is
 *   initializing.
 */
export function useDecksWriter(): DecksWriter | null {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const persistenceState = usePersistence();
  const userId = session?.user?.id ?? null;
  return useMemo(() => {
    if (!userId || persistenceState.status === "pending") {
      return null;
    }
    const entry = getEntry(queryClient, userId, persistenceState.persistence);
    return { userId, deckCards: entry.deckCardsShape, executor: entry.executor };
  }, [queryClient, userId, persistenceState]);
}

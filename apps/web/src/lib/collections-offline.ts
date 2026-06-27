// Collections write path (ADR-027 step 3): the raw synced collections shape
// rows, plus the named mutation functions the offline executor replays from
// its per-user outbox. Mirrors the copies mutation functions in
// copies-collection.ts — each calls the oRPC collections endpoint, awaits the
// returned Postgres txid on the Electric stream so the optimistic overlay holds
// until the synced row arrives, and refreshes the query-layer collections list
// (which still carries the server-derived fields: values, share state, group
// names, per-viewer prefs).

import { collectionsContract } from "@openrift/shared/contracts";
import { ORPCError } from "@orpc/client";
import type { ElectricCollectionUtils, Txid } from "@tanstack/electric-db-collection";
import type { Collection } from "@tanstack/react-db";
import type { QueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { browserApiOrpcClient } from "@/lib/server-fns/orpc-client";
import { asNonRetriableIfPermanent, rethrowAsNetworkError } from "@/lib/sync-mutation-helpers";
import { withTimeout } from "@/lib/with-timeout";

// Raw rows exactly as streamed from Postgres through Electric (snake_case
// column names; shapes are single-table and cannot rename or join). Must
// match the pinned columns in apps/api/src/routes/authenticated/shapes.ts —
// widening either side means bumping PERSISTED_SCHEMA_VERSION in
// copies-collection.ts. Type alias, not interface: the Electric adapter's
// `T extends Row<unknown>` constraint needs the implicit index signature
// interfaces don't get.
// oxlint-disable-next-line typescript/consistent-type-definitions -- see above
export type CollectionShapeRow = {
  id: string;
  group_id: string | null;
  name: string;
  description: string | null;
  is_inbox: boolean;
  sort_order: number;
};

export type CollectionsWriteCollection = Collection<
  CollectionShapeRow,
  string | number,
  ElectricCollectionUtils<CollectionShapeRow>
>;

// The slice of a TanStack DB mutation the collection mutation functions
// actually read. Narrow on purpose so tests can drive them with plain objects.
export interface CollectionMutationLike {
  key: string | number;
  modified: CollectionShapeRow;
  /** Changed fields only — what an update PATCHes to the server. */
  changes?: Partial<CollectionShapeRow>;
}

/**
 * Create inputs the shape row cannot carry: the owning group is resolved
 * server-side from its slug, and deck-building availability is a per-viewer
 * preference, not a column. Stored as transaction metadata so they survive
 * outbox serialization and replay.
 */
export interface CreateCollectionTxMetadata {
  groupSlug?: string;
  availableForDeckbuilding?: boolean;
}

/** Reorder input: the full ordered-id list, as transaction metadata. */
export interface ReorderCollectionsTxMetadata {
  orderedIds?: string[];
}

// ── Mutation API calls ──────────────────────────────────────────────────────
//
// All run entirely client-side: a direct oRPC call to the collections endpoint
// with an AbortController so the timeout can actually cancel the in-flight
// request. Each returns the Postgres txid of its transaction, which the
// mutation functions hand to TanStack DB for Electric-stream matching.

async function createCollectionRequest(
  row: CollectionShapeRow,
  metadata: CreateCollectionTxMetadata,
  signal: AbortSignal,
): Promise<Txid> {
  try {
    const { txid } = await browserApiOrpcClient(collectionsContract).create(
      {
        id: row.id,
        name: row.name,
        description: row.description,
        groupSlug: metadata.groupSlug,
        availableForDeckbuilding: metadata.availableForDeckbuilding,
      },
      { signal },
    );
    return txid;
  } catch (error) {
    rethrowAsNetworkError(error);
  }
}

async function updateCollectionRequest(
  id: string,
  fields: { name?: string; description?: string | null },
  signal: AbortSignal,
): Promise<Txid> {
  try {
    const { txid } = await browserApiOrpcClient(collectionsContract).update(
      { id, ...fields },
      { signal },
    );
    return txid;
  } catch (error) {
    rethrowAsNetworkError(error);
  }
}

async function deleteCollectionRequest(id: string, signal: AbortSignal): Promise<Txid> {
  try {
    const { txid } = await browserApiOrpcClient(collectionsContract).remove({ id }, { signal });
    return txid;
  } catch (error) {
    rethrowAsNetworkError(error);
  }
}

async function reorderCollectionsRequest(orderedIds: string[], signal: AbortSignal): Promise<Txid> {
  try {
    const { txid } = await browserApiOrpcClient(collectionsContract).reorder(
      { orderedIds },
      { signal },
    );
    return txid;
  } catch (error) {
    rethrowAsNetworkError(error);
  }
}

/**
 * The named collection mutation functions the offline executor replays from
 * its outbox (ADR-027 step 3), extracted so they can be unit-tested without
 * standing up the executor.
 *
 * Replay tolerance — a retried transaction may have partially landed before
 * its response was lost, so every function must converge when run twice:
 * creates answer 409 for ids that already exist ("already applied"), updates
 * and reorders are naturally idempotent, deletes answer 404 when the
 * collection is already gone (the desired end state). Other 4xx responses
 * become NonRetriableError so the outbox drops the transaction and rolls back
 * its optimistic state.
 *
 * @returns Named mutation functions for `startOfflineExecutor`.
 */
export function createCollectionOfflineMutationFns(
  queryClient: QueryClient,
  userId: string,
  collection: CollectionsWriteCollection,
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

  // The query-layer list still owns the server-derived fields (values, share
  // state, group slug/name, per-viewer prefs), so every collection mutation
  // refreshes it.
  const invalidateCollectionsList = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.collections.all(userId) });
  };

  return {
    createCollections: async ({
      transaction,
    }: {
      transaction: {
        mutations: CollectionMutationLike[];
        metadata?: CreateCollectionTxMetadata;
      };
    }) => {
      const txids: Txid[] = [];
      for (const mutation of transaction.mutations) {
        const controller = new AbortController();
        try {
          txids.push(
            await withTimeout(
              createCollectionRequest(
                mutation.modified,
                transaction.metadata ?? {},
                controller.signal,
              ),
              { label: "Create collection", abortController: controller },
            ),
          );
        } catch (error) {
          if (error instanceof ORPCError && error.status === 409) {
            // Replay of a create whose first attempt landed (client-generated
            // ids make the insert idempotent) — already applied.
            continue;
          }
          throw asNonRetriableIfPermanent(error);
        }
      }
      await awaitTxidsBestEffort(txids);
      invalidateCollectionsList();
    },

    updateCollections: async ({
      transaction,
    }: {
      transaction: { mutations: CollectionMutationLike[] };
    }) => {
      const txids: Txid[] = [];
      for (const mutation of transaction.mutations) {
        const changes = mutation.changes ?? {};
        const fields: { name?: string; description?: string | null } = {};
        if (changes.name !== undefined) {
          fields.name = changes.name;
        }
        if (changes.description !== undefined) {
          fields.description = changes.description;
        }
        if (Object.keys(fields).length === 0) {
          continue;
        }
        const controller = new AbortController();
        try {
          txids.push(
            await withTimeout(
              updateCollectionRequest(String(mutation.key), fields, controller.signal),
              { label: "Update collection", abortController: controller },
            ),
          );
        } catch (error) {
          // 404 (collection vanished elsewhere) is included: the update is
          // permanently unapplicable, the rollback restores stream truth.
          throw asNonRetriableIfPermanent(error);
        }
      }
      await awaitTxidsBestEffort(txids);
      invalidateCollectionsList();
    },

    deleteCollections: async ({
      transaction,
    }: {
      transaction: { mutations: CollectionMutationLike[] };
    }) => {
      const txids: Txid[] = [];
      for (const mutation of transaction.mutations) {
        const controller = new AbortController();
        try {
          txids.push(
            await withTimeout(deleteCollectionRequest(String(mutation.key), controller.signal), {
              label: "Delete collection",
              abortController: controller,
            }),
          );
        } catch (error) {
          if (error instanceof ORPCError && error.status === 404) {
            // The collection is already gone — the desired end state (replay
            // of a landed delete, or deleted from another device).
            continue;
          }
          // Includes 409 CONFLICT (inbox / non-empty shared collection):
          // permanent refusal, the rollback makes the collection reappear.
          throw asNonRetriableIfPermanent(error);
        }
      }
      await awaitTxidsBestEffort(txids);
      invalidateCollectionsList();
    },

    reorderCollections: async ({
      transaction,
    }: {
      transaction: {
        mutations: CollectionMutationLike[];
        metadata?: ReorderCollectionsTxMetadata;
      };
    }) => {
      // The full ordered list rides in the metadata: the mutations alone are
      // not enough — rows whose sort_order didn't change produce no mutation,
      // and the server re-numbers exactly the ids it receives.
      const orderedIds = transaction.metadata?.orderedIds ?? [];
      if (orderedIds.length === 0) {
        return;
      }
      const controller = new AbortController();
      let txid: Txid;
      try {
        txid = await withTimeout(reorderCollectionsRequest(orderedIds, controller.signal), {
          label: "Reorder collections",
          abortController: controller,
        });
      } catch (error) {
        // Reordering is idempotent; any 4xx is a permanent refusal.
        throw asNonRetriableIfPermanent(error);
      }
      await awaitTxidsBestEffort([txid]);
      invalidateCollectionsList();
    },
  };
}

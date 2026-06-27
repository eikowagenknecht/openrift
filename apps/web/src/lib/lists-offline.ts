// Lists write path (ADR-027 step 3): the raw synced lists / list-entries
// shape rows, plus the named mutation functions the offline executor replays
// from its per-user outbox. Mirrors collections-offline.ts — each calls the
// oRPC lists endpoint, awaits the returned Postgres txid on the Electric stream
// so the optimistic overlay holds until the synced row arrives, and refreshes
// the query-layer lists data (which still carries the server-derived fields:
// entry enrichment, share state, timestamps).

import type { Currency, ListIntent, ListKind, TradePreference } from "@openrift/shared";
import { listsContract } from "@openrift/shared/contracts";
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
// copies-collection.ts. Type aliases, not interfaces: the Electric adapter's
// `T extends Row<unknown>` constraint needs the implicit index signature
// interfaces don't get.
// oxlint-disable-next-line typescript/consistent-type-definitions -- see above
export type ListShapeRow = {
  id: string;
  name: string;
  intent: ListIntent;
  kind: ListKind;
  default_price_pref: TradePreference["pricePref"];
  default_price_absolute_cents: number | null;
  default_trade_type: TradePreference["tradeType"];
  currency: Currency | null;
  sort_order: number;
};

// oxlint-disable-next-line typescript/consistent-type-definitions -- see ListShapeRow
export type ListEntryShapeRow = {
  id: string;
  list_id: string;
  kind: ListKind;
  card_id: string | null;
  printing_id: string | null;
  copy_id: string | null;
  quantity: number;
  price_pref: TradePreference["pricePref"];
  price_absolute_cents: number | null;
  trade_type: TradePreference["tradeType"];
};

export type ListsWriteCollection = Collection<
  ListShapeRow,
  string | number,
  ElectricCollectionUtils<ListShapeRow>
>;

export type ListEntriesWriteCollection = Collection<
  ListEntryShapeRow,
  string | number,
  ElectricCollectionUtils<ListEntryShapeRow>
>;

// The slices of a TanStack DB mutation the list mutation functions actually
// read. Narrow on purpose so tests can drive them with plain objects.
export interface ListMutationLike {
  key: string | number;
  modified: ListShapeRow;
  /** Changed fields only — what an update PATCHes to the server. */
  changes?: Partial<ListShapeRow>;
}

export interface ListEntryMutationLike {
  key: string | number;
  modified: ListEntryShapeRow;
  /** Changed fields only — what an update PATCHes to the server. */
  changes?: Partial<ListEntryShapeRow>;
}

/**
 * Reorder input: the intent bucket plus the full ordered-id list, as
 * transaction metadata — rows whose sort_order didn't change produce no
 * mutation, and the server re-numbers exactly the ids it receives.
 */
export interface ReorderListsTxMetadata {
  intent?: ListIntent;
  orderedIds?: string[];
}

/**
 * Maps the entry shape row's trade columns back to the API's nested
 * `TradePreference` triple.
 *
 * @returns The per-entry trade override in API shape.
 */
export function tradeOverrideFromEntryRow(row: ListEntryShapeRow): TradePreference {
  return {
    pricePref: row.price_pref,
    priceAbsoluteCents: row.price_absolute_cents,
    tradeType: row.trade_type,
  };
}

/**
 * Maps the list shape row's default-trade columns back to the API's nested
 * `TradePreference` triple.
 *
 * @returns The list-level trade defaults in API shape.
 */
export function tradeDefaultsFromListRow(row: ListShapeRow): TradePreference {
  return {
    pricePref: row.default_price_pref,
    priceAbsoluteCents: row.default_price_absolute_cents,
    tradeType: row.default_trade_type,
  };
}

// The API caps bulk entry mutations at 500 rows/ids per request.
const BATCH_SIZE = 500;

function chunks<T>(array: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

// ── Mutation API calls ──────────────────────────────────────────────────────
//
// All run entirely client-side: a direct oRPC call to the lists endpoint with
// an AbortController so the timeout can actually cancel the in-flight request.
// Each returns the Postgres txid of its transaction, which the mutation
// functions hand to TanStack DB for Electric-stream matching.

async function createListRequest(row: ListShapeRow, signal: AbortSignal): Promise<Txid> {
  try {
    const { txid } = await browserApiOrpcClient(listsContract).create(
      {
        id: row.id,
        name: row.name,
        intent: row.intent,
        kind: row.kind,
        // Organize lists never carry trade defaults; the optimistic row
        // already has them nulled, so sending the triple verbatim is safe
        // for every intent.
        tradeDefaults: tradeDefaultsFromListRow(row),
        currency: row.currency,
      },
      { signal },
    );
    return txid;
  } catch (error) {
    rethrowAsNetworkError(error);
  }
}

interface ListPatchFields {
  name?: string;
  tradeDefaults?: TradePreference;
  currency?: Currency | null;
}

async function updateListRequest(
  id: string,
  fields: ListPatchFields,
  signal: AbortSignal,
): Promise<Txid> {
  try {
    const { txid } = await browserApiOrpcClient(listsContract).update(
      { id, ...fields },
      { signal },
    );
    return txid;
  } catch (error) {
    rethrowAsNetworkError(error);
  }
}

async function deleteListRequest(id: string, signal: AbortSignal): Promise<Txid> {
  try {
    const { txid } = await browserApiOrpcClient(listsContract).remove({ id }, { signal });
    return txid;
  } catch (error) {
    rethrowAsNetworkError(error);
  }
}

async function reorderListsRequest(
  intent: ListIntent,
  orderedIds: string[],
  signal: AbortSignal,
): Promise<Txid> {
  try {
    const { txid } = await browserApiOrpcClient(listsContract).reorder(
      { intent, orderedIds },
      { signal },
    );
    return txid;
  } catch (error) {
    rethrowAsNetworkError(error);
  }
}

async function bulkAddEntriesRequest(
  listId: string,
  rows: ListEntryShapeRow[],
  signal: AbortSignal,
): Promise<Txid> {
  try {
    const { txid } = await browserApiOrpcClient(listsContract).bulkCreateEntries(
      {
        id: listId,
        entries: rows.map((row) => ({
          id: row.id,
          ...(row.card_id === null ? {} : { cardId: row.card_id }),
          ...(row.printing_id === null ? {} : { printingId: row.printing_id }),
          ...(row.copy_id === null ? {} : { copyId: row.copy_id }),
          quantity: row.quantity,
          tradeOverride: tradeOverrideFromEntryRow(row),
        })),
      },
      { signal },
    );
    return txid;
  } catch (error) {
    rethrowAsNetworkError(error);
  }
}

interface ListEntryPatchFields {
  quantity?: number;
  tradeOverride?: TradePreference;
}

async function updateEntryRequest(
  listId: string,
  entryId: string,
  fields: ListEntryPatchFields,
  signal: AbortSignal,
): Promise<Txid> {
  try {
    const { txid } = await browserApiOrpcClient(listsContract).updateEntry(
      { id: listId, itemId: entryId, ...fields },
      { signal },
    );
    return txid;
  } catch (error) {
    rethrowAsNetworkError(error);
  }
}

async function bulkDeleteEntriesRequest(
  listId: string,
  entryIds: string[],
  signal: AbortSignal,
): Promise<Txid> {
  try {
    const { txid } = await browserApiOrpcClient(listsContract).bulkDeleteEntries(
      { id: listId, entryIds },
      { signal },
    );
    return txid;
  } catch (error) {
    rethrowAsNetworkError(error);
  }
}

/**
 * The named list mutation functions the offline executor replays from its
 * outbox (ADR-027 step 3), extracted so they can be unit-tested without
 * standing up the executor.
 *
 * Replay tolerance — a retried transaction may have partially landed before
 * its response was lost, so every function must converge when run twice:
 * list creates answer 409 for ids that already exist ("already applied"),
 * entry inserts carry client ids so the server's upsert guard turns a
 * replayed insert into a no-op instead of a double quantity bump, updates
 * and reorders are naturally idempotent (absolute values), and deletes
 * answer 404 when the row is already gone (the desired end state). Other
 * 4xx responses become NonRetriableError so the outbox drops the
 * transaction and rolls back its optimistic state.
 *
 * @returns Named mutation functions for `startOfflineExecutor`.
 */
export function createListOfflineMutationFns(
  queryClient: QueryClient,
  userId: string,
  lists: ListsWriteCollection,
  listEntries: ListEntriesWriteCollection,
) {
  // The server has already committed when a txid is awaited — a lagging
  // stream must not fail (and re-run) the transaction, so timeouts are
  // swallowed and the stream converges on its own.
  const awaitTxidsBestEffort = async (
    collection: ListsWriteCollection | ListEntriesWriteCollection,
    txids: Txid[],
  ) => {
    try {
      await Promise.all(txids.map((txid) => collection.utils.awaitTxId(txid)));
    } catch {
      // Stream lag; the rows arrive momentarily.
    }
  };

  // The query layer still owns the server-derived list data (entry
  // enrichment, share state, timestamps), so every list mutation refreshes
  // it. The base key is a prefix of the intent-filtered and per-list detail
  // keys, so one invalidation covers all three.
  const invalidateLists = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.lists.all(userId) });
  };

  return {
    createLists: async ({ transaction }: { transaction: { mutations: ListMutationLike[] } }) => {
      const txids: Txid[] = [];
      for (const mutation of transaction.mutations) {
        const controller = new AbortController();
        try {
          txids.push(
            await withTimeout(createListRequest(mutation.modified, controller.signal), {
              label: "Create list",
              abortController: controller,
            }),
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
      await awaitTxidsBestEffort(lists, txids);
      invalidateLists();
    },

    updateLists: async ({ transaction }: { transaction: { mutations: ListMutationLike[] } }) => {
      const txids: Txid[] = [];
      for (const mutation of transaction.mutations) {
        const changes = mutation.changes ?? {};
        const fields: ListPatchFields = {};
        if (changes.name !== undefined) {
          fields.name = changes.name;
        }
        if (
          changes.default_price_pref !== undefined ||
          changes.default_price_absolute_cents !== undefined ||
          changes.default_trade_type !== undefined
        ) {
          // The API sets the triple as one unit; send the full modified state.
          fields.tradeDefaults = tradeDefaultsFromListRow(mutation.modified);
        }
        if (changes.currency !== undefined) {
          fields.currency = changes.currency;
        }
        if (Object.keys(fields).length === 0) {
          continue;
        }
        const controller = new AbortController();
        try {
          txids.push(
            await withTimeout(updateListRequest(String(mutation.key), fields, controller.signal), {
              label: "Update list",
              abortController: controller,
            }),
          );
        } catch (error) {
          // 404 (list vanished elsewhere) is included: the update is
          // permanently unapplicable, the rollback restores stream truth.
          throw asNonRetriableIfPermanent(error);
        }
      }
      await awaitTxidsBestEffort(lists, txids);
      invalidateLists();
    },

    deleteLists: async ({ transaction }: { transaction: { mutations: ListMutationLike[] } }) => {
      const txids: Txid[] = [];
      for (const mutation of transaction.mutations) {
        const controller = new AbortController();
        try {
          txids.push(
            await withTimeout(deleteListRequest(String(mutation.key), controller.signal), {
              label: "Delete list",
              abortController: controller,
            }),
          );
        } catch (error) {
          if (error instanceof ORPCError && error.status === 404) {
            // The list is already gone — the desired end state (replay of a
            // landed delete, or deleted from another device).
            continue;
          }
          throw asNonRetriableIfPermanent(error);
        }
      }
      await awaitTxidsBestEffort(lists, txids);
      invalidateLists();
    },

    reorderLists: async ({
      transaction,
    }: {
      transaction: {
        mutations: ListMutationLike[];
        metadata?: ReorderListsTxMetadata;
      };
    }) => {
      // The intent bucket and the full ordered list ride in the metadata: the
      // mutations alone are not enough — rows whose sort_order didn't change
      // produce no mutation, and the server re-numbers exactly the ids it
      // receives within the given intent.
      const intent = transaction.metadata?.intent;
      const orderedIds = transaction.metadata?.orderedIds ?? [];
      if (!intent || orderedIds.length === 0) {
        return;
      }
      const controller = new AbortController();
      let txid: Txid;
      try {
        txid = await withTimeout(reorderListsRequest(intent, orderedIds, controller.signal), {
          label: "Reorder lists",
          abortController: controller,
        });
      } catch (error) {
        // Reordering is idempotent; any 4xx is a permanent refusal.
        throw asNonRetriableIfPermanent(error);
      }
      await awaitTxidsBestEffort(lists, [txid]);
      invalidateLists();
    },

    createListEntries: async ({
      transaction,
    }: {
      transaction: { mutations: ListEntryMutationLike[] };
    }) => {
      // One bulk request per target list (entries of one user action almost
      // always target a single list), chunked to the API's 500-row cap.
      const byList = Map.groupBy(transaction.mutations, (mutation) =>
        String(mutation.modified.list_id),
      );
      const txids: Txid[] = [];
      for (const [listId, mutations] of byList) {
        const rows = mutations.map((mutation) => mutation.modified);
        for (const batch of chunks(rows, BATCH_SIZE)) {
          const controller = new AbortController();
          try {
            txids.push(
              await withTimeout(bulkAddEntriesRequest(listId, batch, controller.signal), {
                label: "Add list entries",
                abortController: controller,
              }),
            );
          } catch (error) {
            // Includes 404 (list vanished elsewhere): permanently
            // unapplicable, the rollback restores stream truth. A replayed
            // batch whose first attempt landed is NOT an error path — the
            // server's id guard answers 200 and counts the rows as skipped.
            throw asNonRetriableIfPermanent(error);
          }
        }
      }
      await awaitTxidsBestEffort(listEntries, txids);
      invalidateLists();
    },

    updateListEntries: async ({
      transaction,
    }: {
      transaction: { mutations: ListEntryMutationLike[] };
    }) => {
      const txids: Txid[] = [];
      for (const mutation of transaction.mutations) {
        const changes = mutation.changes ?? {};
        const fields: ListEntryPatchFields = {};
        if (changes.quantity !== undefined) {
          fields.quantity = changes.quantity;
        }
        if (
          changes.price_pref !== undefined ||
          changes.price_absolute_cents !== undefined ||
          changes.trade_type !== undefined
        ) {
          // The API sets the triple as one unit; send the full modified state.
          fields.tradeOverride = tradeOverrideFromEntryRow(mutation.modified);
        }
        if (Object.keys(fields).length === 0) {
          continue;
        }
        const controller = new AbortController();
        try {
          txids.push(
            await withTimeout(
              updateEntryRequest(
                mutation.modified.list_id,
                String(mutation.key),
                fields,
                controller.signal,
              ),
              { label: "Update list entry", abortController: controller },
            ),
          );
        } catch (error) {
          // 404 (entry vanished elsewhere) is included: the update is
          // permanently unapplicable, the rollback restores stream truth.
          throw asNonRetriableIfPermanent(error);
        }
      }
      await awaitTxidsBestEffort(listEntries, txids);
      invalidateLists();
    },

    deleteListEntries: async ({
      transaction,
    }: {
      transaction: { mutations: ListEntryMutationLike[] };
    }) => {
      // Delete mutations carry the deleted row as `modified`, so the owning
      // list id is available without a lookup.
      const byList = Map.groupBy(transaction.mutations, (mutation) =>
        String(mutation.modified.list_id),
      );
      const txids: Txid[] = [];
      for (const [listId, mutations] of byList) {
        const ids = mutations.map((mutation) => String(mutation.key));
        for (const batch of chunks(ids, BATCH_SIZE)) {
          const controller = new AbortController();
          try {
            txids.push(
              await withTimeout(bulkDeleteEntriesRequest(listId, batch, controller.signal), {
                label: "Remove list entries",
                abortController: controller,
              }),
            );
          } catch (error) {
            if (error instanceof ORPCError && error.status === 404) {
              // The list itself is already gone (and its entries with it) —
              // the desired end state. Entry ids that no longer exist are
              // filtered server-side and never 404.
              continue;
            }
            throw asNonRetriableIfPermanent(error);
          }
        }
      }
      await awaitTxidsBestEffort(listEntries, txids);
      invalidateLists();
    },
  };
}

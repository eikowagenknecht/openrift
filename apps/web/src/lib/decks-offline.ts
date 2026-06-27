// Deck-cards write path (ADR-027 decks vertical): the raw synced deck-card
// shape rows, plus the named mutation function the offline executor replays
// from its per-user outbox. Mirrors lists-offline.ts — each batch POSTs the
// row-level changes to the deck-card apply endpoint, awaits the returned
// Postgres txid on the Electric stream so the optimistic overlay holds until
// the synced rows arrive, and refreshes the query-layer deck data (which
// still carries the server-derived fields: list aggregates, deck values,
// validation summaries).

import type { DeckZone } from "@openrift/shared";
import { decksContract } from "@openrift/shared/contracts";
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
export type DeckCardShapeRow = {
  id: string;
  deck_id: string;
  card_id: string;
  zone: DeckZone;
  quantity: number;
  preferred_printing_id: string | null;
};

export type DeckCardsWriteCollection = Collection<
  DeckCardShapeRow,
  string | number,
  ElectricCollectionUtils<DeckCardShapeRow>
>;

// The slice of a TanStack DB mutation the deck mutation function actually
// reads. Narrow on purpose so tests can drive it with plain objects. One
// deck-edit transaction mixes inserts, quantity updates, and deletes, so the
// mutation type rides along to split them into upserts vs deletes.
export interface DeckCardMutationLike {
  type: "insert" | "update" | "delete";
  key: string | number;
  /** For deletes this carries the deleted row, so deck_id needs no lookup. */
  modified: DeckCardShapeRow;
}

/** One apply request: row upserts plus row-id deletes for a single deck. */
interface ApplyBatch {
  upserts: DeckCardShapeRow[];
  deletes: string[];
}

// The API caps upserts and deletes at 500 rows/ids per request.
const BATCH_SIZE = 500;

function chunks<T>(array: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

/**
 * Splits one deck's upserts + deletes into request-sized batches. Deletes
 * always dispatch before (or together with) upserts: a zone move within one
 * transaction is delete-old-row + insert-new-row on the same content key, and
 * an upsert landing before its paired delete would update the old row and
 * then lose it. The common case (both lists within the cap) stays a single
 * request.
 *
 * @returns The ordered batches to POST.
 */
export function buildApplyBatches(upserts: DeckCardShapeRow[], deletes: string[]): ApplyBatch[] {
  if (upserts.length === 0 && deletes.length === 0) {
    return [];
  }
  if (upserts.length <= BATCH_SIZE && deletes.length <= BATCH_SIZE) {
    return [{ upserts, deletes }];
  }
  return [
    ...chunks(deletes, BATCH_SIZE).map((batch) => ({ upserts: [], deletes: batch })),
    ...chunks(upserts, BATCH_SIZE).map((batch) => ({ upserts: batch, deletes: [] })),
  ];
}

// Runs entirely client-side: a direct oRPC call to /api/v1/decks/:id/cards/apply
// with an AbortController so the timeout can actually cancel the in-flight
// request. Returns the Postgres txid of the write's transaction, which the
// mutation function hands to TanStack DB for Electric-stream matching.
async function applyDeckCardsRequest(
  deckId: string,
  batch: ApplyBatch,
  signal: AbortSignal,
): Promise<Txid> {
  try {
    const { txid } = await browserApiOrpcClient(decksContract).applyCards(
      {
        id: deckId,
        upserts: batch.upserts.map((row) => ({
          id: row.id,
          cardId: row.card_id,
          zone: row.zone,
          quantity: row.quantity,
          preferredPrintingId: row.preferred_printing_id,
        })),
        deletes: batch.deletes,
      },
      { signal },
    );
    return txid;
  } catch (error) {
    rethrowAsNetworkError(error);
  }
}

/**
 * The named deck mutation function the offline executor replays from its
 * outbox (ADR-027 step 3), extracted so it can be unit-tested without
 * standing up the executor.
 *
 * Replay tolerance — a retried transaction may have partially landed before
 * its response was lost, so the function must converge when run twice:
 * upserts carry client row ids and absolute quantities and converge on the
 * server's content unique index, and deletes of already-gone rows are
 * filtered server-side. A 404 (the deck itself vanished elsewhere) is a
 * permanent refusal — NonRetriableError drops the transaction and rolls back
 * its optimistic rows, matching the stream truth of a deleted deck.
 *
 * @returns Named mutation functions for `startOfflineExecutor`.
 */
export function createDeckOfflineMutationFns(
  queryClient: QueryClient,
  userId: string,
  deckCards: DeckCardsWriteCollection,
) {
  // The server has already committed when a txid is awaited — a lagging
  // stream must not fail (and re-run) the transaction, so timeouts are
  // swallowed and the stream converges on its own.
  const awaitTxidsBestEffort = async (txids: Txid[]) => {
    try {
      await Promise.all(txids.map((txid) => deckCards.utils.awaitTxId(txid)));
    } catch {
      // Stream lag; the rows arrive momentarily.
    }
  };

  // The query layer still owns the server-derived deck data (list aggregates,
  // deck values, validation summaries, detail metadata), so every card write
  // refreshes it. The base key is a prefix of the per-deck detail key, so one
  // invalidation covers both.
  const invalidateDecks = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.decks.all(userId) });
  };

  return {
    applyDeckCards: async ({
      transaction,
    }: {
      transaction: { mutations: DeckCardMutationLike[] };
    }) => {
      // One transaction is per-deck in practice (the deck builder's debounce
      // window targets a single deck), but group defensively.
      const byDeck = Map.groupBy(transaction.mutations, (mutation) =>
        String(mutation.modified.deck_id),
      );
      const txids: Txid[] = [];
      for (const [deckId, mutations] of byDeck) {
        const upserts = mutations
          .filter((mutation) => mutation.type !== "delete")
          .map((mutation) => mutation.modified);
        const deletes = mutations
          .filter((mutation) => mutation.type === "delete")
          .map((mutation) => String(mutation.key));
        for (const batch of buildApplyBatches(upserts, deletes)) {
          const controller = new AbortController();
          try {
            txids.push(
              await withTimeout(applyDeckCardsRequest(deckId, batch, controller.signal), {
                label: "Save deck cards",
                abortController: controller,
              }),
            );
          } catch (error) {
            // Includes 404 (deck vanished elsewhere): permanently
            // unapplicable, the rollback restores stream truth. A replayed
            // batch whose first attempt landed is NOT an error path — upserts
            // converge on the content key and deletes are filtered.
            throw asNonRetriableIfPermanent(error);
          }
        }
      }
      await awaitTxidsBestEffort(txids);
      invalidateDecks();
    },
  };
}

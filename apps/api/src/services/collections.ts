import type { Transact } from "../deps.js";
import { logEvents } from "./event-logger.js";

interface DeleteCollectionOpts {
  collectionId: string;
  collectionName: string;
  moveCopiesTo: string;
  targetName: string;
  userId: string;
}

/**
 * Deletes a collection, atomically relocating its copies to the target
 * collection and logging move events.
 *
 * @returns The deletion's Postgres transaction id for Electric stream
 *   matching (ADR-027 step 2).
 */
export function deleteCollection(
  transact: Transact,
  opts: DeleteCollectionOpts,
): Promise<{ txid: number }> {
  const { collectionId, collectionName, moveCopiesTo, targetName, userId } = opts;

  return transact(async (trxRepos) => {
    const copies = await trxRepos.collections.listCopiesInCollection(collectionId);

    if (copies.length > 0) {
      await trxRepos.collections.moveCopiesBetweenCollections(collectionId, moveCopiesTo);

      await logEvents(
        trxRepos,
        copies.map((copy) => ({
          userId,
          action: "moved" as const,
          printingId: copy.printingId,
          copyId: copy.id,
          fromCollectionId: collectionId,
          fromCollectionName: collectionName,
          toCollectionId: moveCopiesTo,
          toCollectionName: targetName,
        })),
      );
    }

    // Let the FK's ON DELETE SET NULL handle existing events. The check
    // constraint allows rows with a name snapshot but no collection id, so
    // historical events stay readable as "moved from <deleted collection>".
    await trxRepos.collections.deleteByIdForUser(collectionId, userId);

    return { txid: await trxRepos.sync.currentTransactionId() };
  });
}

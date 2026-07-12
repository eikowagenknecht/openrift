import type { Transact } from "../deps.js";
import { disposeCopiesInTransaction } from "./copies.js";
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
 */
export async function deleteCollection(
  transact: Transact,
  opts: DeleteCollectionOpts,
): Promise<void> {
  const { collectionId, collectionName, moveCopiesTo, targetName, userId } = opts;

  await transact(async (trxRepos) => {
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
  });
}

interface ClearCollectionOpts {
  collectionId: string;
  userId: string;
}

interface ClearCollectionResult {
  removedCount: number;
  keptCopyIds: string[];
}

/**
 * Removes every copy from a collection without deleting the collection itself
 * (the inbox can never be deleted, so "clear" is its delete-equivalent).
 * Copies reserved by a live trade or out on a loan are physically pinned;
 * instead of failing the whole clear they are kept and reported back.
 * Disposal runs through {@link disposeCopiesInTransaction}, so `removed`
 * events are logged like any other dispose.
 *
 * @returns How many copies were removed and the ids of the copies kept.
 */
export function clearCollection(
  transact: Transact,
  opts: ClearCollectionOpts,
): Promise<ClearCollectionResult> {
  const { collectionId, userId } = opts;

  return transact(async (trxRepos) => {
    const copies = await trxRepos.collections.listCopiesInCollection(collectionId);
    if (copies.length === 0) {
      return { removedCount: 0, keptCopyIds: [] };
    }

    const copyIds = copies.map((copy) => copy.id);
    const reserved = await trxRepos.cardTrades.filterReservedCopyIds(copyIds);
    const loaned = await trxRepos.loans.filterLoanedCopyIds(copyIds);
    const kept = new Set([...reserved, ...loaned]);
    const disposable = copyIds.filter((id) => !kept.has(id));

    if (disposable.length > 0) {
      // The trade/loan pins were already filtered out above, inside this same
      // transaction, so the dispose-level guard would only re-check them.
      await disposeCopiesInTransaction(trxRepos, userId, disposable, {
        skipReservationGuard: true,
      });
    }

    return { removedCount: disposable.length, keptCopyIds: [...kept] };
  });
}

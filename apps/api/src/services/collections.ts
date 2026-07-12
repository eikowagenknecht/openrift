import { ERROR_CODES } from "@openrift/shared";
import type { ResetCollectionsResponse } from "@openrift/shared";

import type { Transact } from "../deps.js";
import { AppError } from "../errors.js";
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

// Keeps guard IN-lists and event batch inserts well under postgres.js's
// ~65k bind-parameter limit even for very large collections.
const RESET_BATCH_SIZE = 1000;

/**
 * @returns The input split into consecutive slices of at most `size` items.
 */
function chunk<T>(items: readonly T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

/**
 * Danger-zone reset: deletes every copy in the user's personal collections,
 * deletes every personal collection except the inbox, and prunes lists the
 * wipe emptied (no remaining entries, no dynamic rules). Group collections
 * and their copies are untouched. Refuses (409) while any of the user's
 * copies are reserved in an active trade or out on a loan.
 * @returns Counts of the deleted copies, collections, and lists.
 */
export function resetCollections(
  transact: Transact,
  userId: string,
): Promise<ResetCollectionsResponse> {
  return transact(async (trxRepos) => {
    const copies = await trxRepos.copies.listInPersonalCollections(userId);
    const copyIdBatches = chunk(
      copies.map((copy) => copy.id),
      RESET_BATCH_SIZE,
    );

    // Same guards as disposeCopies: a reserved copy is physically promised to
    // a trade, a loaned copy is out of the house — refuse to destroy either.
    for (const batch of copyIdBatches) {
      const reserved = await trxRepos.cardTrades.filterReservedCopyIds(batch);
      if (reserved.length > 0) {
        throw new AppError(
          409,
          ERROR_CODES.CONFLICT,
          "Some of your cards are reserved in active trades — cancel those trades first.",
        );
      }
      const loaned = await trxRepos.loans.filterLoanedCopyIds(batch);
      if (loaned.length > 0) {
        throw new AppError(
          409,
          ERROR_CODES.CONFLICT,
          "Some of your cards are lent out — mark those loans returned or written off first.",
        );
      }
    }

    // Snapshot before the wipe: only lists that had entries going in are
    // prune candidates, so a list the user emptied earlier stays around.
    const pruneCandidateIds = await trxRepos.lists.listIdsWithEntries(userId);

    // Log disposal events while the copy FKs still resolve (same shape as
    // disposeCopies; collection_events.copy_id goes SET NULL on delete).
    for (const batch of chunk(copies, RESET_BATCH_SIZE)) {
      await logEvents(
        trxRepos,
        batch.map((copy) => ({
          userId,
          action: "removed" as const,
          printingId: copy.printingId,
          copyId: copy.id,
          fromCollectionId: copy.collectionId,
          fromCollectionName: copy.collectionName,
        })),
      );
    }

    // Copies first — a DB trigger blocks deleting a non-empty collection.
    // Deleting copies also cascades away the copy-kind list entries, which is
    // what turns lists into prune candidates below.
    const removedCopies = await trxRepos.copies.deleteAllInPersonalCollections(userId);
    const removedCollections = await trxRepos.collections.deleteAllPersonalExceptInbox(userId);
    await trxRepos.collections.ensureInbox(userId);
    const removedLists = await trxRepos.lists.deleteEmptyWithoutRules(userId, pruneCandidateIds);

    return { removedCopies, removedCollections, removedLists };
  });
}

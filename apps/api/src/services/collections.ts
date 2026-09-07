import { ERROR_CODES } from "@openrift/shared/error-codes";
import type { ResetCollectionsResponse } from "@openrift/shared/types/api/collection";

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

    // Events snapshot id and name, not an FK: deleting the collection must not erase history that references it.
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
 * Copies reserved by a live trade or out on a loan are kept, not cleared,
 * and reported back.
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
    // Lock before reading the pins, or a concurrent trade-accept/loan could
    // pin a copy in the gap and have the delete cascade the pin away.
    await trxRepos.copies.lockByIds(copyIds);
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

function chunk<T>(items: readonly T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

/**
 * Group collections and their copies are untouched. Refuses (409) while any
 * of the user's copies are reserved in an active trade or out on a loan.
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

    // Each batch is locked before its pin reads, so a concurrent
    // trade-accept/loan can't pin a copy between the guard and the delete.
    for (const batch of copyIdBatches) {
      await trxRepos.copies.lockByIds(batch);
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
    const removedCopies = await trxRepos.copies.deleteAllInPersonalCollections(userId);
    const removedCollections = await trxRepos.collections.deleteAllPersonalExceptInbox(userId);
    await trxRepos.collections.ensureInbox(userId);
    const removedLists = await trxRepos.lists.deleteEmptyWithoutRules(userId, pruneCandidateIds);

    return { removedCopies, removedCollections, removedLists };
  });
}

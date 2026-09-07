import { normalizeCopyMetadataPatch } from "@openrift/shared/copy-metadata";
import { ERROR_CODES } from "@openrift/shared/error-codes";
import { createLogger } from "@openrift/shared/logger";
import type { CopyLink, CopyMetadataPatch } from "@openrift/shared/types/api/collection";

import type { Repos, Transact } from "../deps.js";
import { AppError } from "../errors.js";
import { assertFound } from "../lib/assertions.js";
import { autoCancelUnfillablePendingTrades } from "./card-trades.js";
import { logEvents } from "./event-logger.js";
import { ensureInbox } from "./inbox.js";

const log = createLogger("copies");

interface AddCopyInput {
  id?: string;
  printingId: string;
  collectionId?: string;
  condition?: string | null;
  grader?: string | null;
  grade?: number | null;
  notesPublic?: string | null;
  notesPrivate?: string | null;
  isAltered?: boolean;
  links?: CopyLink[];
}

interface AddCopyResult {
  id: string;
  printingId: string;
  collectionId: string;
  /** Owning group of the copy's collection; null for personal collections. */
  groupId: string | null;
  condition: string | null;
  grader: string | null;
  grade: number | null;
  notesPublic: string | null;
  notesPrivate: string | null;
  isAltered: boolean;
  links: CopyLink[];
  /** Always false for a just-created copy. */
  onLoan: boolean;
  /** Always false for a just-created copy: not yet reserved. */
  reserved: boolean;
}

export async function addCopies(
  repos: Repos,
  transact: Transact,
  userId: string,
  copies: AddCopyInput[],
  options?: { batchId?: string },
): Promise<AddCopyResult[]> {
  const inboxId = await ensureInbox(repos, userId);

  const explicitIds = [...new Set(copies.map((c) => c.collectionId).filter(Boolean))] as string[];
  if (explicitIds.length > 0) {
    const writable = await repos.collections.filterWritableByViewer(explicitIds, userId);
    if (writable.length !== explicitIds.length) {
      throw new AppError(
        403,
        ERROR_CODES.FORBIDDEN,
        "One or more collections are not writable by you",
      );
    }
  }

  const outcome = await transact(async (trxRepos) => {
    // Copies carry no owner column — ownership derives from the collection.
    // The acting `userId` is recorded only as the event actor below.
    const copyValues = copies.map((item) => ({
      id: item.id,
      printingId: item.printingId,
      collectionId: item.collectionId ?? inboxId,
      condition: item.condition ?? null,
      grader: item.grader ?? null,
      grade: item.grade ?? null,
      notesPublic: item.notesPublic ?? null,
      notesPrivate: item.notesPrivate ?? null,
      isAltered: item.isAltered ?? false,
      links: item.links ?? undefined,
    }));

    const insertedRows = await trxRepos.copies.insertBatch(copyValues);
    const insertedById = new Map(insertedRows.map((row) => [row.id, row]));

    const suppliedIds = copies.map((item) => item.id).filter((id) => id !== undefined);
    const missingIds = suppliedIds.filter((id) => !insertedById.has(id));
    const replayedRows = await trxRepos.copies.findByIdsInCollections(missingIds, [
      ...new Set([...explicitIds, inboxId]),
    ]);
    const replayedById = new Map(replayedRows.map((row) => [row.id, row]));

    const supplied = new Set(suppliedIds);
    const generated = insertedRows.filter((row) => !supplied.has(row.id));
    let generatedIndex = 0;
    const rows = copies.map((item) => {
      if (item.id === undefined) {
        const row = generated[generatedIndex];
        generatedIndex += 1;
        assertFound(row, "Copy was not created");
        return row;
      }
      const inserted = insertedById.get(item.id);
      if (inserted) {
        return inserted;
      }
      const replayed = replayedById.get(item.id);
      const sameCopy =
        replayed !== undefined &&
        replayed.collectionId === (item.collectionId ?? inboxId) &&
        replayed.printingId === item.printingId;
      if (!sameCopy) {
        throw new AppError(409, ERROR_CODES.CONFLICT, "One or more copy ids are already taken");
      }
      return replayed;
    });

    const collectionIds = [...new Set(rows.map((row) => row.collectionId))];
    const collectionRows = await trxRepos.collections.listIdNameGroupByIds(collectionIds);
    const collectionNames = new Map(collectionRows.map((col) => [col.id, col.name]));
    const collectionGroupIds = new Map(collectionRows.map((col) => [col.id, col.groupId]));

    await logEvents(
      trxRepos,
      insertedRows.map((row) => ({
        userId,
        action: "added" as const,
        printingId: row.printingId,
        copyId: row.id,
        toCollectionId: row.collectionId,
        toCollectionName: collectionNames.get(row.collectionId) ?? null,
      })),
    );

    return {
      rows: rows.map((row) => ({
        ...row,
        groupId: collectionGroupIds.get(row.collectionId) ?? null,
      })),
      inserted: insertedRows.length,
      replayed: replayedRows.length,
    };
  });

  log.info(
    {
      userId,
      batchId: options?.batchId,
      requested: copies.length,
      inserted: outcome.inserted,
      replayed: outcome.replayed,
    },
    "copies added",
  );

  return outcome.rows;
}

/**
 * Applies one metadata patch to a batch of copies. Metadata edits are not
 * logged to `collection_events` (the ledger stays a movement history).
 *
 * Cross-field state is normalized via {@link normalizeCopyMetadataPatch}
 * (shared with the client's optimistic update) so a patch only has to be
 * internally consistent.
 */
export async function updateCopies(
  transact: Transact,
  userId: string,
  copyIds: string[],
  patch: CopyMetadataPatch,
): Promise<void> {
  const normalized = normalizeCopyMetadataPatch(patch);

  await transact(async (trxRepos) => {
    const copies = await trxRepos.copies.listWithCollectionContext(copyIds);

    if (copies.length !== copyIds.length) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "One or more copies not found");
    }

    const sourceIds = [...new Set(copies.map((row) => row.collectionId))];
    const writableSources = await trxRepos.collections.filterWritableByViewer(sourceIds, userId);
    if (writableSources.length !== sourceIds.length) {
      throw new AppError(403, ERROR_CODES.FORBIDDEN, "One or more copies are not writable by you");
    }

    await trxRepos.copies.updateMetadataBatchById(copyIds, {
      ...normalized,
      links: normalized.links ?? undefined,
    });
  });
}

/** Must run inside the caller's transaction so the copy change and the cancellations commit together. */
async function sweepUnfillableTrades(
  trxRepos: Repos,
  userId: string,
  printingIds: Iterable<string>,
): Promise<void> {
  for (const printingId of new Set(printingIds)) {
    // Sequential: the repos are bound to a single transaction connection.
    await autoCancelUnfillablePendingTrades(trxRepos, userId, printingId);
  }
}

/**
 * A copy reserved by a trade may still move between the owner's own personal
 * collections, but not into a group collection. Reservations pin personal
 * copies only, and the whole group would otherwise see `reserved` on a copy
 * that is not theirs.
 */
export async function moveCopies(
  repos: Repos,
  transact: Transact,
  userId: string,
  copyIds: string[],
  toCollectionId: string,
): Promise<void> {
  const targetWritable = await repos.collections.filterWritableByViewer([toCollectionId], userId);
  if (targetWritable.length === 0) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "Target collection not found");
  }
  const targetMeta = await repos.collections.listIdNameGroupByIds([toCollectionId]);
  const target = targetMeta[0];
  assertFound(target, "Target collection not found");

  await transact(async (trxRepos) => {
    const copies = await trxRepos.copies.listWithCollectionContext(copyIds);

    if (copies.length !== copyIds.length) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "One or more copies not found");
    }

    const sourceIds = [...new Set(copies.map((row) => row.collectionId))];
    const writableSources = await trxRepos.collections.filterWritableByViewer(sourceIds, userId);
    if (writableSources.length !== sourceIds.length) {
      throw new AppError(403, ERROR_CODES.FORBIDDEN, "One or more copies are not writable by you");
    }

    if (target.groupId !== null) {
      // Lock the rows first so a concurrent trade-accept serializes against this
      // move. Without the lock the guard below could pass, the pin lands in the
      // gap, and the copy still ends up group-owned while reserved.
      await trxRepos.copies.lockByIds(copyIds);
      const reserved = await trxRepos.cardTrades.filterReservedCopyIds(copyIds);
      if (reserved.length > 0) {
        throw new AppError(
          409,
          ERROR_CODES.CONFLICT,
          "This card is reserved in a trade. It can only move between your own collections.",
        );
      }
    }

    await trxRepos.copies.moveBatchById(
      copies.map((row) => row.id),
      toCollectionId,
    );

    await logEvents(
      trxRepos,
      copies.map((copy) => ({
        userId,
        action: "moved" as const,
        printingId: copy.printingId,
        copyId: copy.id,
        fromCollectionId: copy.collectionId,
        fromCollectionName: copy.collectionName,
        toCollectionId: target.id,
        toCollectionName: target.name,
      })),
    );

    if (target.groupId !== null) {
      // The copy now belongs to the group, so the owner has nothing left to
      // offer. Their trade-list entries would otherwise keep advertising it:
      // supply is built from list membership, not ownership, and nothing else
      // clears an entry whose copy left the owner's collections.
      await trxRepos.lists.deleteTradeEntriesForCopies(copyIds, userId);
    }

    // A move can take a copy out of the supply a group can see, so the owner's
    // pending trades for those printings may no longer be fillable.
    await sweepUnfillableTrades(
      trxRepos,
      userId,
      copies.map((copy) => copy.printingId),
    );
  });
}

/**
 * Rejects copies pinned by a live or unresolved-sync trade reservation.
 * Trade-sync's giver path releases the reservation first, then disposes with the guard skipped via {@link disposeCopiesInTransaction}.
 */
export async function disposeCopies(
  transact: Transact,
  userId: string,
  copyIds: string[],
): Promise<void> {
  await transact((trxRepos) => disposeCopiesInTransaction(trxRepos, userId, copyIds));
}

/**
 * The body of {@link disposeCopies}, runnable inside an existing transaction.
 * Lets trade-sync combine reservation-release + dispose atomically while
 * keeping a single copy-deletion choke point that emits `removed` events.
 */
export async function disposeCopiesInTransaction(
  trxRepos: Repos,
  userId: string,
  copyIds: string[],
  options?: { skipReservationGuard?: boolean },
): Promise<void> {
  // Lock the copy rows first so a concurrent trade-accept or loan reserving one
  // of them serializes against this dispose. Without the lock the reservation
  // guard below could pass, the reserve pin lands in the gap, and the delete
  // would cascade the just-created reservation away.
  await trxRepos.copies.lockByIds(copyIds);

  const copies = await trxRepos.copies.listWithCollectionContext(copyIds);

  if (copies.length !== copyIds.length) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "One or more copies not found");
  }

  const sourceIds = [...new Set(copies.map((row) => row.collectionId))];
  const writableSources = await trxRepos.collections.filterWritableByViewer(sourceIds, userId);
  if (writableSources.length !== sourceIds.length) {
    throw new AppError(403, ERROR_CODES.FORBIDDEN, "One or more copies are not writable by you");
  }

  // A reserved copy is physically promised to a trade — refuse to destroy it.
  // Same for a copy out on a loan: write-off releases its pins first and then
  // disposes in the same transaction, so the guard passes there.
  if (options?.skipReservationGuard !== true) {
    const pins = await trxRepos.cardTrades.listReservationsForCopies(copyIds);
    if (pins.length > 0) {
      // A pin on a still-live trade is freed by cancelling it. A pin that
      // outlived completion (the giver never resolved their sync) is not:
      // cancel only accepts pending/reserved, so pointing at it would name an
      // impossible remedy. Resolving or skipping the sync releases those.
      const live = pins.some((pin) => pin.status === "pending" || pin.status === "reserved");
      throw new AppError(
        409,
        ERROR_CODES.CONFLICT,
        live
          ? "This card is reserved in an active trade — cancel the trade to free it."
          : "This card is still reserved by a completed trade. Resolve or skip that trade's sync to free it.",
      );
    }
    const loaned = await trxRepos.loans.filterLoanedCopyIds(copyIds);
    if (loaned.length > 0) {
      throw new AppError(
        409,
        ERROR_CODES.CONFLICT,
        "This card is lent out — mark the loan returned or written off to free it.",
      );
    }
  }

  // Log before deleting, while the copy FK is still valid.
  await logEvents(
    trxRepos,
    copies.map((copy) => ({
      userId,
      action: "removed" as const,
      printingId: copy.printingId,
      copyId: copy.id,
      fromCollectionId: copy.collectionId,
      fromCollectionName: copy.collectionName,
    })),
  );

  // Hard-delete copies (collection_events.copy_id → SET NULL via FK)
  await trxRepos.copies.deleteBatchById(copies.map((row) => row.id));

  // Close now: a pending trade counting on a deleted copy would otherwise
  // 409 only when accepted, possibly a week later.
  await sweepUnfillableTrades(
    trxRepos,
    userId,
    copies.map((row) => row.printingId),
  );
}

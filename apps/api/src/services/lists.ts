import type { ListMoveResponse } from "@openrift/shared";

import type { Repos, Transact } from "../deps.js";
import { AppError, ERROR_CODES } from "../errors.js";

/**
 * Moves a set of entries from one list to another. The destination must be
 * owned by the same user and have the same `kind` and `intent` as the
 * source. The move is transactional — destination insert and source delete
 * happen in the same transaction, so a failed insert never leaves the source
 * with missing entries.
 *
 * Per-kind merge semantics mirror the existing `bulkCreateEntries`:
 *   - card / printing kind: a destination entry for the same target absorbs
 *     the source quantity; the destination's `tradeOverride` is preserved
 *     (the user set it deliberately on that list).
 *   - copy kind: a destination entry for the same copy keeps its existing
 *     tradeOverride and the source row is discarded (a copy can't be on the
 *     same list twice — see the partial unique index from migration 133).
 *
 * @returns Counts of entries removed from source and entries that merged
 *   into existing destination entries.
 */
export async function moveListEntries(
  repos: Repos,
  transact: Transact,
  userId: string,
  fromListId: string,
  toListId: string,
  entryIds: string[],
): Promise<ListMoveResponse> {
  if (fromListId === toListId) {
    throw new AppError(400, ERROR_CODES.BAD_REQUEST, "Source and destination must differ");
  }

  const [source, destination] = await Promise.all([
    repos.lists.getByIdForUser(fromListId, userId),
    repos.lists.getByIdForUser(toListId, userId),
  ]);
  if (!source) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "Source list not found");
  }
  if (!destination) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "Destination list not found");
  }
  if (source.kind !== destination.kind) {
    throw new AppError(
      400,
      ERROR_CODES.BAD_REQUEST,
      "Destination list must have the same kind as the source",
    );
  }
  if (source.intent !== destination.intent) {
    throw new AppError(
      400,
      ERROR_CODES.BAD_REQUEST,
      "Destination list must have the same intent as the source",
    );
  }

  return transact(async (trxRepos) => {
    const entries = await trxRepos.lists.entriesForMove(fromListId, userId, entryIds);
    if (entries.length === 0) {
      return { moved: 0, merged: 0 };
    }

    const insertable = entries.map((entry) => ({
      listId: toListId,
      userId,
      kind: source.kind,
      cardId: entry.cardId,
      printingId: entry.printingId,
      copyId: entry.copyId,
      quantity: entry.quantity,
      pricePref: entry.pricePref,
      priceAbsoluteCents: entry.priceAbsoluteCents,
      tradeType: entry.tradeType,
    }));

    const upsertResult = await trxRepos.lists.bulkCreateEntries(source.kind, insertable);

    const sourceIds = entries.map((entry) => entry.id);
    const deleted = await trxRepos.lists.deleteEntriesByIds(sourceIds, fromListId, userId);
    const moved = Number(deleted.numDeletedRows);

    return { moved, merged: upsertResult.updated };
  });
}

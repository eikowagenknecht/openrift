import { ERROR_CODES } from "@openrift/shared/error-codes";
import type { ListMoveResponse } from "@openrift/shared/types/api/list";

import type { Repos, Transact } from "../../../deps.js";
import { AppError } from "../../../errors.js";

/** Merge semantics mirror `bulkCreateEntries`: card/printing entries absorb into an
 * existing target keeping its tradeOverride; copy entries discard the source row. */
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

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

    await trxRepos.collections.deleteByIdForUser(collectionId, userId);
  });
}

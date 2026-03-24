import type { Transact } from "../deps.js";
import { createActivity } from "./activity-logger.js";

interface DeleteCollectionOpts {
  collectionId: string;
  collectionName: string;
  moveCopiesTo: string;
  targetName: string;
  userId: string;
}

/**
 * Deletes a collection, atomically relocating its copies to the target
 * collection and logging a reorganization activity.
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

      await createActivity(trxRepos, {
        userId,
        type: "reorganization",
        name: `Moved cards from deleted collection "${collectionName}"`,
        isAuto: true,
        items: copies.map((copy) => ({
          copyId: copy.id,
          printingId: copy.printingId,
          action: "moved" as const,
          fromCollectionId: collectionId,
          fromCollectionName: collectionName,
          toCollectionId: moveCopiesTo,
          toCollectionName: targetName,
        })),
      });
    }

    await trxRepos.collections.deleteByIdForUser(collectionId, userId);
  });
}

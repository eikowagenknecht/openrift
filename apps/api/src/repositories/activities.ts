import type { CardType } from "@openrift/shared/types";
import type { Kysely, Selectable } from "kysely";

import { imageUrl } from "../db-helpers.js";
import type { ActivitiesTable, ActivityItemsTable, Database, PrintingsTable } from "../db/index.js";

/** Activity item row with printing, card, and image details. */
type ActivityItemRow = Pick<
  Selectable<ActivityItemsTable>,
  | "id"
  | "activityId"
  | "activityType"
  | "copyId"
  | "printingId"
  | "action"
  | "fromCollectionId"
  | "fromCollectionName"
  | "toCollectionId"
  | "toCollectionName"
  | "metadataSnapshot"
  | "createdAt"
> &
  Pick<Selectable<PrintingsTable>, "setId" | "collectorNumber" | "rarity"> & {
    imageUrl: string | null;
    cardName: string;
    cardType: CardType;
  };

/**
 * Queries for user activity history.
 *
 * @returns An object with activity query methods bound to the given `db`.
 */
export function activitiesRepo(db: Kysely<Database>) {
  return {
    /** @returns A cursor-paginated list of activities for a user (newest first). Fetches `limit + 1` rows to detect `hasMore`. */
    listForUser(
      userId: string,
      limit: number,
      cursor?: string,
    ): Promise<Selectable<ActivitiesTable>[]> {
      let query = db
        .selectFrom("activities")
        .selectAll()
        .where("userId", "=", userId)
        .orderBy("createdAt", "desc")
        .limit(limit + 1);
      if (cursor) {
        query = query.where("createdAt", "<", new Date(cursor));
      }
      return query.execute();
    },

    /** @returns A single activity by ID scoped to a user, or `undefined`. */
    getByIdForUser(id: string, userId: string): Promise<Selectable<ActivitiesTable> | undefined> {
      return db
        .selectFrom("activities")
        .selectAll()
        .where("id", "=", id)
        .where("userId", "=", userId)
        .executeTakeFirst();
    },

    /** @returns Activity items joined with printing, card, and image details. */
    itemsWithDetails(activityId: string): Promise<ActivityItemRow[]> {
      return db
        .selectFrom("activityItems as ai")
        .innerJoin("printings as p", "p.id", "ai.printingId")
        .innerJoin("cards as card", "card.id", "p.cardId")
        .leftJoin("printingImages as pi", (join) =>
          join
            .onRef("pi.printingId", "=", "p.id")
            .on("pi.face", "=", "front")
            .on("pi.isActive", "=", true),
        )
        .select([
          "ai.id",
          "ai.activityId",
          "ai.activityType",
          "ai.copyId",
          "ai.printingId",
          "ai.action",
          "ai.fromCollectionId",
          "ai.fromCollectionName",
          "ai.toCollectionId",
          "ai.toCollectionName",
          "ai.metadataSnapshot",
          "ai.createdAt",
          imageUrl("pi").as("imageUrl"),
          "p.setId",
          "p.collectorNumber",
          "p.rarity",
          "card.name as cardName",
          "card.type as cardType",
        ])
        .where("ai.activityId", "=", activityId)
        .orderBy("ai.createdAt")
        .execute();
    },
  };
}

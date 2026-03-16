import type { CardType } from "@openrift/shared/types";
import type { Kysely, Selectable } from "kysely";

import { imageUrl } from "../db-helpers.js";
import type { ActivitiesTable, ActivityItemsTable, Database, PrintingsTable } from "../db/index.js";

/** Activity item row with printing, card, and image details. */
type ActivityItemRow = Pick<
  Selectable<ActivityItemsTable>,
  | "id"
  | "activity_id"
  | "activity_type"
  | "copy_id"
  | "printing_id"
  | "action"
  | "from_collection_id"
  | "from_collection_name"
  | "to_collection_id"
  | "to_collection_name"
  | "metadata_snapshot"
  | "created_at"
> &
  Pick<Selectable<PrintingsTable>, "set_id" | "collector_number" | "rarity"> & {
    image_url: string | null;
    card_name: string;
    card_type: CardType;
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
        .where("user_id", "=", userId)
        .orderBy("created_at", "desc")
        .limit(limit + 1);
      if (cursor) {
        query = query.where("created_at", "<", new Date(cursor));
      }
      return query.execute();
    },

    /** @returns A single activity by ID scoped to a user, or `undefined`. */
    getByIdForUser(id: string, userId: string): Promise<Selectable<ActivitiesTable> | undefined> {
      return db
        .selectFrom("activities")
        .selectAll()
        .where("id", "=", id)
        .where("user_id", "=", userId)
        .executeTakeFirst();
    },

    /** @returns Activity items joined with printing, card, and image details. */
    itemsWithDetails(activityId: string): Promise<ActivityItemRow[]> {
      return db
        .selectFrom("activity_items as ai")
        .innerJoin("printings as p", "p.id", "ai.printing_id")
        .innerJoin("cards as card", "card.id", "p.card_id")
        .leftJoin("printing_images as pi", (join) =>
          join
            .onRef("pi.printing_id", "=", "p.id")
            .on("pi.face", "=", "front")
            .on("pi.is_active", "=", true),
        )
        .select([
          "ai.id",
          "ai.activity_id",
          "ai.activity_type",
          "ai.copy_id",
          "ai.printing_id",
          "ai.action",
          "ai.from_collection_id",
          "ai.from_collection_name",
          "ai.to_collection_id",
          "ai.to_collection_name",
          "ai.metadata_snapshot",
          "ai.created_at",
          imageUrl("pi").as("image_url"),
          "p.set_id",
          "p.collector_number",
          "p.rarity",
          "card.name as card_name",
          "card.type as card_type",
        ])
        .where("ai.activity_id", "=", activityId)
        .orderBy("ai.created_at")
        .execute();
    },
  };
}

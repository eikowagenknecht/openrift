import type { Kysely } from "kysely";

import { imageUrl, selectCopyWithCard } from "../db-helpers.js";
import type { Database } from "../db/index.js";

const COPY_SELECT = [
  "cp.id",
  "cp.printing_id",
  "cp.collection_id",
  "cp.source_id",
  "cp.created_at",
  "cp.updated_at",
  "p.card_id",
  "p.set_id",
  "p.collector_number",
  "p.rarity",
  "p.art_variant",
  "p.is_signed",
  "p.finish",
  imageUrl("pi").as("image_url"),
  "p.artist",
  "c.name as card_name",
  "c.type as card_type",
] as const;

/**
 * Read-only queries for user copy data.
 *
 * @returns An object with copy query methods bound to the given `db`.
 */
export function copiesRepo(db: Kysely<Database>) {
  return {
    /** @returns All copies for a user, ordered by card name then collector number. */
    listForUser(userId: string) {
      return selectCopyWithCard(db)
        .select([...COPY_SELECT])
        .where("cp.user_id", "=", userId)
        .orderBy("c.name")
        .orderBy("p.collector_number")
        .execute();
    },

    /** @returns A single copy by ID scoped to a user, or `undefined`. */
    getByIdForUser(id: string, userId: string) {
      return selectCopyWithCard(db)
        .select([...COPY_SELECT])
        .where("cp.id", "=", id)
        .where("cp.user_id", "=", userId)
        .executeTakeFirst();
    },

    /** @returns Owned count per printing for a user. */
    countByPrintingForUser(userId: string) {
      return db
        .selectFrom("copies")
        .select(["printing_id", db.fn.count<number>("id").as("count")])
        .where("user_id", "=", userId)
        .groupBy("printing_id")
        .execute();
    },

    /** @returns All copies in a specific collection, ordered by card name then collector number. */
    listForCollection(collectionId: string) {
      return selectCopyWithCard(db)
        .select([...COPY_SELECT])
        .where("cp.collection_id", "=", collectionId)
        .orderBy("c.name")
        .orderBy("p.collector_number")
        .execute();
    },
  };
}

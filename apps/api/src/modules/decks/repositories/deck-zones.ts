import type { Kysely } from "kysely";

import type { Database } from "../../../db/index.js";
import { reorderBySortOrder } from "../../catalog/repositories/sort-order.js";

export function deckZonesRepo(db: Kysely<Database>) {
  return {
    listAll() {
      return db.selectFrom("deckZones").selectAll().orderBy("sortOrder").execute();
    },

    reorder(slugs: readonly string[]): Promise<void> {
      return reorderBySortOrder(db, { table: "deckZones", keyColumn: "slug", keys: slugs });
    },

    update(slug: string, updates: { label?: string }) {
      return db
        .updateTable("deckZones")
        .set(updates)
        .where("slug", "=", slug)
        .executeTakeFirstOrThrow();
    },
  };
}

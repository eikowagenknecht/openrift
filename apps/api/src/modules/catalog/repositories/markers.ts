import type { Kysely } from "kysely";

import type { Database } from "../../../db/index.js";
import { reorderBySortOrder } from "./sort-order.js";

export function markersRepo(db: Kysely<Database>) {
  return {
    listAll() {
      return db.selectFrom("markers").selectAll().orderBy("sortOrder").orderBy("label").execute();
    },

    getById(id: string) {
      return db.selectFrom("markers").selectAll().where("id", "=", id).executeTakeFirst();
    },

    getBySlug(slug: string) {
      return db.selectFrom("markers").selectAll().where("slug", "=", slug).executeTakeFirst();
    },

    listBySlugs(slugs: readonly string[]) {
      if (slugs.length === 0) {
        return Promise.resolve([]);
      }
      return db.selectFrom("markers").selectAll().where("slug", "in", slugs).execute();
    },

    async getMaxSortOrder(): Promise<number> {
      const row = await db
        .selectFrom("markers")
        .select((eb) => eb.fn.max("sortOrder").as("maxSortOrder"))
        .executeTakeFirst();
      return row?.maxSortOrder ?? -1;
    },

    create(values: {
      slug: string;
      label: string;
      description?: string | null;
      sortOrder?: number;
    }) {
      return db
        .insertInto("markers")
        .values({
          slug: values.slug,
          label: values.label,
          description: values.description ?? null,
          ...(values.sortOrder === undefined ? {} : { sortOrder: values.sortOrder }),
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    reorder(ids: readonly string[]): Promise<void> {
      return reorderBySortOrder(db, {
        table: "markers",
        keyColumn: "id",
        keys: ids,
        keyType: "uuid",
      });
    },

    update(
      id: string,
      updates: { slug?: string; label?: string; description?: string | null; updatedAt?: Date },
    ) {
      return db.updateTable("markers").set(updates).where("id", "=", id).executeTakeFirstOrThrow();
    },

    deleteById(id: string) {
      return db.deleteFrom("markers").where("id", "=", id).executeTakeFirstOrThrow();
    },

    isInUse(id: string) {
      return db
        .selectFrom("printingMarkers")
        .select("printingId")
        .where("markerId", "=", id)
        .limit(1)
        .executeTakeFirst();
    },

    async setForPrinting(printingId: string, markerIds: readonly string[]): Promise<void> {
      const run = async (trx: Kysely<Database>): Promise<void> => {
        await trx.deleteFrom("printingMarkers").where("printingId", "=", printingId).execute();
        if (markerIds.length === 0) {
          return;
        }
        await trx
          .insertInto("printingMarkers")
          .values(markerIds.map((markerId) => ({ printingId, markerId })))
          .execute();
      };
      await (db.isTransaction ? run(db) : db.transaction().execute(run));
    },
  };
}

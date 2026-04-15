import type { Kysely } from "kysely";
import { sql } from "kysely";

import type { Database } from "../db/index.js";

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

    async reorder(ids: string[]): Promise<void> {
      if (ids.length === 0) {
        return;
      }
      const values = sql.join(ids.map((id, i) => sql`(${id}::uuid, ${i}::int)`));
      await sql`
        update markers
        set sort_order = d.new_order
        from (values ${values}) as d(id, new_order)
        where markers.id = d.id
      `.execute(db);
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
      await db.deleteFrom("printingMarkers").where("printingId", "=", printingId).execute();
      if (markerIds.length === 0) {
        return;
      }
      await db
        .insertInto("printingMarkers")
        .values(markerIds.map((markerId) => ({ printingId, markerId })))
        .execute();
    },
  };
}

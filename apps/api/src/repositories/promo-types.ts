import type { Kysely } from "kysely";
import { sql } from "kysely";

import type { Database } from "../db/index.js";

export function promoTypesRepo(db: Kysely<Database>) {
  return {
    listAll() {
      return db
        .selectFrom("promoTypes")
        .selectAll()
        .orderBy("sortOrder")
        .orderBy("label")
        .execute();
    },

    getById(id: string) {
      return db.selectFrom("promoTypes").selectAll().where("id", "=", id).executeTakeFirst();
    },

    getBySlug(slug: string) {
      return db.selectFrom("promoTypes").selectAll().where("slug", "=", slug).executeTakeFirst();
    },

    async getMaxSortOrder(): Promise<number> {
      const row = await db
        .selectFrom("promoTypes")
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
        .insertInto("promoTypes")
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
        update promo_types
        set sort_order = d.new_order
        from (values ${values}) as d(id, new_order)
        where promo_types.id = d.id
      `.execute(db);
    },

    update(
      id: string,
      updates: { slug?: string; label?: string; description?: string | null; updatedAt?: Date },
    ) {
      return db
        .updateTable("promoTypes")
        .set(updates)
        .where("id", "=", id)
        .executeTakeFirstOrThrow();
    },

    deleteById(id: string) {
      return db.deleteFrom("promoTypes").where("id", "=", id).executeTakeFirstOrThrow();
    },

    isInUse(id: string) {
      return db
        .selectFrom("printings")
        .select("id")
        .where("promoTypeId", "=", id)
        .limit(1)
        .executeTakeFirst();
    },
  };
}

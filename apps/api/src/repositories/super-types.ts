import type { Kysely } from "kysely";
import { sql } from "kysely";

import type { Database } from "../db/index.js";

export function superTypesRepo(db: Kysely<Database>) {
  return {
    listAll() {
      return db.selectFrom("superTypes").selectAll().orderBy("sortOrder").execute();
    },

    getBySlug(slug: string) {
      return db.selectFrom("superTypes").selectAll().where("slug", "=", slug).executeTakeFirst();
    },

    create(values: { slug: string; label: string; sortOrder?: number }) {
      return db
        .insertInto("superTypes")
        .values({
          slug: values.slug,
          label: values.label,
          sortOrder: values.sortOrder ?? 0,
          isWellKnown: false,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    update(slug: string, updates: { label?: string }) {
      return db
        .updateTable("superTypes")
        .set(updates)
        .where("slug", "=", slug)
        .executeTakeFirstOrThrow();
    },

    deleteBySlug(slug: string) {
      return db.deleteFrom("superTypes").where("slug", "=", slug).executeTakeFirstOrThrow();
    },

    isInUse(slug: string) {
      return db
        .selectFrom("cardSuperTypes")
        .select("cardId")
        .where("superTypeSlug", "=", slug)
        .limit(1)
        .executeTakeFirst();
    },

    async reorder(slugs: string[]): Promise<void> {
      if (slugs.length === 0) {
        return;
      }
      const values = sql.join(slugs.map((slug, i) => sql`(${slug}::text, ${i}::int)`));
      await sql`
        update super_types
        set sort_order = d.new_order
        from (values ${values}) as d(slug, new_order)
        where super_types.slug = d.slug
      `.execute(db);
    },
  };
}

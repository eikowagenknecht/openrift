import type { Rarity } from "@openrift/shared/types";
import type { Kysely } from "kysely";
import { sql } from "kysely";

import type { Database } from "../db/index.js";

export function raritiesRepo(db: Kysely<Database>) {
  return {
    listAll() {
      return db.selectFrom("rarities").selectAll().orderBy("sortOrder").execute();
    },

    getBySlug(slug: string) {
      return db.selectFrom("rarities").selectAll().where("slug", "=", slug).executeTakeFirst();
    },

    create(values: { slug: string; label: string; color?: string | null; sortOrder?: number }) {
      return db
        .insertInto("rarities")
        .values({
          slug: values.slug,
          label: values.label,
          color: values.color ?? null,
          sortOrder: values.sortOrder ?? 0,
          isWellKnown: false,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    update(slug: string, updates: { label?: string; color?: string | null }) {
      return db
        .updateTable("rarities")
        .set(updates)
        .where("slug", "=", slug)
        .executeTakeFirstOrThrow();
    },

    deleteBySlug(slug: string) {
      return db.deleteFrom("rarities").where("slug", "=", slug).executeTakeFirstOrThrow();
    },

    isInUse(slug: string) {
      return db
        .selectFrom("printings")
        .select("id")
        .where("rarity", "=", slug as Rarity)
        .limit(1)
        .executeTakeFirst();
    },

    async reorder(slugs: string[]): Promise<void> {
      if (slugs.length === 0) {
        return;
      }
      const values = sql.join(slugs.map((slug, i) => sql`(${slug}::text, ${i}::int)`));
      await sql`
        update rarities
        set sort_order = d.new_order
        from (values ${values}) as d(slug, new_order)
        where rarities.slug = d.slug
      `.execute(db);
    },
  };
}

import type { ArtVariant } from "@openrift/shared/types";
import type { Kysely } from "kysely";
import { sql } from "kysely";

import type { Database } from "../db/index.js";

export function artVariantsRepo(db: Kysely<Database>) {
  return {
    listAll() {
      return db.selectFrom("artVariants").selectAll().orderBy("sortOrder").execute();
    },

    getBySlug(slug: string) {
      return db.selectFrom("artVariants").selectAll().where("slug", "=", slug).executeTakeFirst();
    },

    create(values: { slug: string; label: string; sortOrder?: number }) {
      return db
        .insertInto("artVariants")
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
        .updateTable("artVariants")
        .set(updates)
        .where("slug", "=", slug)
        .executeTakeFirstOrThrow();
    },

    deleteBySlug(slug: string) {
      return db.deleteFrom("artVariants").where("slug", "=", slug).executeTakeFirstOrThrow();
    },

    isInUse(slug: string) {
      return db
        .selectFrom("printings")
        .select("id")
        .where("artVariant", "=", slug as ArtVariant)
        .limit(1)
        .executeTakeFirst();
    },

    async reorder(slugs: string[]): Promise<void> {
      if (slugs.length === 0) {
        return;
      }
      const values = sql.join(slugs.map((slug, i) => sql`(${slug}::text, ${i}::int)`));
      await sql`
        update art_variants
        set sort_order = d.new_order
        from (values ${values}) as d(slug, new_order)
        where art_variants.slug = d.slug
      `.execute(db);
    },
  };
}

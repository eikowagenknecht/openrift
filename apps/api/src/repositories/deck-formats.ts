import type { DeckFormat } from "@openrift/shared/types";
import type { Kysely } from "kysely";
import { sql } from "kysely";

import type { Database } from "../db/index.js";

export function deckFormatsRepo(db: Kysely<Database>) {
  return {
    listAll() {
      return db.selectFrom("deckFormats").selectAll().orderBy("sortOrder").execute();
    },

    getBySlug(slug: string) {
      return db.selectFrom("deckFormats").selectAll().where("slug", "=", slug).executeTakeFirst();
    },

    create(values: { slug: string; label: string; sortOrder?: number }) {
      return db
        .insertInto("deckFormats")
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
        .updateTable("deckFormats")
        .set(updates)
        .where("slug", "=", slug)
        .executeTakeFirstOrThrow();
    },

    deleteBySlug(slug: string) {
      return db.deleteFrom("deckFormats").where("slug", "=", slug).executeTakeFirstOrThrow();
    },

    isInUse(slug: string) {
      return db
        .selectFrom("decks")
        .select("id")
        .where("format", "=", slug as DeckFormat)
        .limit(1)
        .executeTakeFirst();
    },

    async reorder(slugs: string[]): Promise<void> {
      if (slugs.length === 0) {
        return;
      }
      const values = sql.join(slugs.map((slug, i) => sql`(${slug}::text, ${i}::int)`));
      await sql`
        update deck_formats
        set sort_order = d.new_order
        from (values ${values}) as d(slug, new_order)
        where deck_formats.slug = d.slug
      `.execute(db);
    },
  };
}

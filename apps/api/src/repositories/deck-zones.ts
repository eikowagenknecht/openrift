import type { Kysely } from "kysely";
import { sql } from "kysely";

import type { Database } from "../db/index.js";

export function deckZonesRepo(db: Kysely<Database>) {
  return {
    listAll() {
      return db.selectFrom("deckZones").selectAll().orderBy("sortOrder").execute();
    },

    async reorder(slugs: string[]): Promise<void> {
      if (slugs.length === 0) {
        return;
      }
      const values = sql.join(slugs.map((slug, i) => sql`(${slug}::text, ${i}::int)`));
      await sql`
        update deck_zones
        set sort_order = d.new_order
        from (values ${values}) as d(slug, new_order)
        where deck_zones.slug = d.slug
      `.execute(db);
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

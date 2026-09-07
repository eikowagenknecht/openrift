import type { SetReleases } from "@openrift/shared/set-release";
import type { Kysely, Selectable } from "kysely";
import { sql } from "kysely";

import type { Database } from "../../../db/tables.js";
import type { SetsTable } from "../../../db/tables/catalog.js";

/** No `released` boolean: clients derive it from the dates via `isReleased`. */
type CatalogSetRow = Pick<Selectable<SetsTable>, "id" | "slug" | "name" | "setType"> & {
  releases: SetReleases;
};

/**
 * The per-language release map for a set, as a correlated subquery so the set
 * reads stay one round trip.
 */
function releasesJson() {
  return sql<SetReleases>`coalesce((
    SELECT jsonb_object_agg(
      r.language,
      jsonb_build_object('releasedAt', r.released_at, 'precision', r.precision)
    )
    FROM set_releases r
    WHERE r.set_id = sets.id
  ), '{}'::jsonb)`.as("releases");
}

export function catalogSetsRepo(db: Kysely<Database>) {
  return {
    async sets(): Promise<CatalogSetRow[]> {
      const rows = await db
        .selectFrom("sets")
        .select(["id", "slug", "name", "setType", releasesJson()])
        .orderBy("sortOrder")
        .execute();
      return rows;
    },

    async setsByIds(ids: string[]): Promise<CatalogSetRow[]> {
      if (ids.length === 0) {
        return [];
      }
      const rows = await db
        .selectFrom("sets")
        .select(["id", "slug", "name", "setType", releasesJson()])
        .where("id", "in", ids)
        .orderBy("sortOrder")
        .execute();
      return rows;
    },

    async setBySlug(slug: string): Promise<CatalogSetRow | undefined> {
      return await db
        .selectFrom("sets")
        .select(["id", "slug", "name", "setType", releasesJson()])
        .where("slug", "=", slug)
        .executeTakeFirst();
    },

    async allSetSitemapEntries(): Promise<{ slug: string; updatedAt: string }[]> {
      const rows = await db
        .selectFrom("sets")
        .select(["slug", "updatedAt"])
        .orderBy("sortOrder")
        .execute();
      return rows.map((row) => ({ slug: row.slug, updatedAt: row.updatedAt.toISOString() }));
    },
  };
}

import type { Kysely } from "kysely";
import { sql } from "kysely";

import type { Database } from "../../../db/tables.js";

export interface CollectionValue {
  collectionId: string;
  totalValueCents: number;
  unpricedCopyCount: number;
}

export function marketplaceCollectionValueRepo(db: Kysely<Database>) {
  return {
    /**
     * Caller passes the list of accessible collections (personal + shared) so
     * that shared collections — whose copies carry the contributors' user_ids,
     * not the viewer's — are included.
     */
    async collectionValues(
      collectionIds: readonly string[],
      marketplace: string,
    ): Promise<Map<string, CollectionValue>> {
      if (collectionIds.length === 0) {
        return new Map();
      }
      const ids = collectionIds as string[];
      const rows = await sql<CollectionValue>`
        SELECT
          cp.collection_id AS "collectionId",
          COALESCE(SUM(mvp.headline_cents), 0)::int AS "totalValueCents",
          (COUNT(cp.id) - COUNT(mvp.headline_cents))::int AS "unpricedCopyCount"
        FROM copies cp
        LEFT JOIN mv_latest_printing_prices mvp
          ON mvp.printing_id = cp.printing_id AND mvp.marketplace = ${marketplace}
        WHERE cp.collection_id IN (${sql.join(ids)})
        GROUP BY cp.collection_id
      `.execute(db);

      return new Map(rows.rows.map((row) => [row.collectionId, row]));
    },

    async singleCollectionValue(
      collectionId: string,
      marketplace: string,
    ): Promise<CollectionValue | undefined> {
      const rows = await sql<CollectionValue>`
        SELECT
          cp.collection_id AS "collectionId",
          COALESCE(SUM(mvp.headline_cents), 0)::int AS "totalValueCents",
          (COUNT(cp.id) - COUNT(mvp.headline_cents))::int AS "unpricedCopyCount"
        FROM copies cp
        LEFT JOIN mv_latest_printing_prices mvp
          ON mvp.printing_id = cp.printing_id AND mvp.marketplace = ${marketplace}
        WHERE cp.collection_id = ${collectionId}
        GROUP BY cp.collection_id
      `.execute(db);

      return rows.rows[0];
    },
  };
}

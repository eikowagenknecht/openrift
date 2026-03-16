import type { Kysely } from "kysely";

import type { Database } from "../db/index.js";

/**
 * Read-only queries for marketplace prices and snapshots.
 *
 * @returns An object with marketplace query methods bound to the given `db`.
 */
export function marketplaceRepo(db: Kysely<Database>) {
  return {
    /**
     * Latest TCGPlayer market price for every printing.
     *
     * Uses `DISTINCT ON` to efficiently pick only the most recent snapshot
     * per source without scanning the full `marketplace_snapshots` table.
     *
     * @returns Rows with `printing_id` and `market_cents`.
     */
    latestPrices() {
      return db
        .selectFrom("marketplace_sources as ps")
        .innerJoin("marketplace_snapshots as snap", "snap.source_id", "ps.id")
        .innerJoin("printings as p", "p.id", "ps.printing_id")
        .where("ps.marketplace", "=", "tcgplayer")
        .distinctOn("ps.id")
        .select(["p.id as printing_id", "snap.market_cents"])
        .orderBy("ps.id")
        .orderBy("snap.recorded_at", "desc")
        .execute();
    },

    /** @returns Marketplace sources (TCGPlayer / Cardmarket) linked to a printing. */
    sourcesForPrinting(printingId: string) {
      return db
        .selectFrom("marketplace_sources")
        .select(["id", "external_id", "marketplace"])
        .where("printing_id", "=", printingId)
        .execute();
    },

    /** @returns Snapshots for a single source, optionally filtered by a cutoff date, ordered chronologically. */
    snapshots(sourceId: string, cutoff: Date | null) {
      let query = db
        .selectFrom("marketplace_snapshots")
        .selectAll()
        .where("source_id", "=", sourceId)
        .orderBy("recorded_at", "asc");
      if (cutoff) {
        query = query.where("recorded_at", ">=", cutoff);
      }
      return query.execute();
    },
  };
}

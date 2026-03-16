import type { Kysely, Selectable } from "kysely";
import { sql } from "kysely";

import type { Database, MarketplaceSnapshotsTable, MarketplaceSourcesTable } from "../db/index.js";

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
     * @returns Rows with `printingId` and `marketCents`.
     */
    latestPrices(): Promise<{ printingId: string; marketCents: number }[]> {
      return db
        .selectFrom("marketplaceSources as ps")
        .innerJoin("marketplaceSnapshots as snap", "snap.sourceId", "ps.id")
        .innerJoin("printings as p", "p.id", "ps.printingId")
        .where("ps.marketplace", "=", "tcgplayer")
        .distinctOn("ps.id")
        .select(["p.id as printingId", "snap.marketCents"])
        .orderBy("ps.id")
        .orderBy("snap.recordedAt", "desc")
        .execute();
    },

    /** @returns The most recent `recorded_at` across all marketplace snapshots. */
    pricesLastModified(): Promise<{ lastModified: Date }> {
      return db
        .selectFrom("marketplaceSnapshots")
        .select(sql<Date>`MAX(recorded_at)`.as("lastModified"))
        .executeTakeFirstOrThrow();
    },

    /** @returns Marketplace sources (TCGPlayer / Cardmarket) linked to a printing. */
    sourcesForPrinting(
      printingId: string,
    ): Promise<Pick<Selectable<MarketplaceSourcesTable>, "id" | "externalId" | "marketplace">[]> {
      return db
        .selectFrom("marketplaceSources")
        .select(["id", "externalId", "marketplace"])
        .where("printingId", "=", printingId)
        .execute();
    },

    /** @returns Snapshots for a single source, optionally filtered by a cutoff date, ordered chronologically. */
    snapshots(
      sourceId: string,
      cutoff: Date | null,
    ): Promise<Selectable<MarketplaceSnapshotsTable>[]> {
      let query = db
        .selectFrom("marketplaceSnapshots")
        .selectAll()
        .where("sourceId", "=", sourceId)
        .orderBy("recordedAt", "asc");
      if (cutoff) {
        query = query.where("recordedAt", ">=", cutoff);
      }
      return query.execute();
    },
  };
}

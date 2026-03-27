import type { Kysely, Selectable } from "kysely";

import type { Database, MarketplaceSnapshotsTable, MarketplaceProductsTable } from "../db/index.js";

/**
 * Read-only queries for marketplace prices and snapshots.
 *
 * @returns An object with marketplace query methods bound to the given `db`.
 */
export function marketplaceRepo(db: Kysely<Database>) {
  return {
    /**
     * Latest market price per marketplace for every printing.
     *
     * Uses `DISTINCT ON` to efficiently pick only the most recent snapshot
     * per product without scanning the full `marketplace_snapshots` table.
     *
     * @returns Rows with `printingId`, `marketplace`, and `marketCents`.
     */
    latestPrices(): Promise<{ printingId: string; marketplace: string; marketCents: number }[]> {
      return db
        .selectFrom("marketplaceProducts as ps")
        .innerJoin("marketplaceSnapshots as snap", "snap.productId", "ps.id")
        .innerJoin("printings as p", "p.id", "ps.printingId")
        .distinctOn("ps.id")
        .select(["p.id as printingId", "ps.marketplace", "snap.marketCents"])
        .orderBy("ps.id")
        .orderBy("snap.recordedAt", "desc")
        .execute();
    },

    /** @returns Marketplace sources (TCGPlayer / Cardmarket) linked to a printing. */
    sourcesForPrinting(
      printingId: string,
    ): Promise<Pick<Selectable<MarketplaceProductsTable>, "id" | "externalId" | "marketplace">[]> {
      return db
        .selectFrom("marketplaceProducts")
        .select(["id", "externalId", "marketplace"])
        .where("printingId", "=", printingId)
        .execute();
    },

    /** @returns Snapshots for a single source, optionally filtered by a cutoff date, ordered chronologically. */
    snapshots(
      productId: string,
      cutoff: Date | null,
    ): Promise<
      Pick<
        Selectable<MarketplaceSnapshotsTable>,
        | "recordedAt"
        | "marketCents"
        | "lowCents"
        | "midCents"
        | "highCents"
        | "trendCents"
        | "avg1Cents"
        | "avg7Cents"
        | "avg30Cents"
      >[]
    > {
      let query = db
        .selectFrom("marketplaceSnapshots")
        .select([
          "recordedAt",
          "marketCents",
          "lowCents",
          "midCents",
          "highCents",
          "trendCents",
          "avg1Cents",
          "avg7Cents",
          "avg30Cents",
        ])
        .where("productId", "=", productId)
        .orderBy("recordedAt", "asc");
      if (cutoff) {
        query = query.where("recordedAt", ">=", cutoff);
      }
      return query.execute();
    },
  };
}

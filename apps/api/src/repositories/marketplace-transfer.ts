import type { Kysely } from "kysely";
import { sql } from "kysely";

import type { Database } from "../db/index.js";

/**
 * Queries for transferring marketplace data between staging and snapshots
 * during map/unmap operations.
 *
 * @returns An object with marketplace transfer methods bound to the given `db`.
 */
export function marketplaceTransferRepo(db: Kysely<Database>) {
  return {
    /** @returns The latest snapshot rows for mapped printings in a given marketplace. */
    snapshotsByMarketplace(marketplace: string, printingIds: string[]) {
      return db
        .selectFrom("marketplaceProducts as ps")
        .innerJoin("marketplaceSnapshots as snap", "snap.productId", "ps.id")
        .select([
          "ps.printingId",
          "ps.productName",
          "snap.marketCents",
          "snap.lowCents",
          "snap.midCents",
          "snap.highCents",
          "snap.trendCents",
          "snap.avg1Cents",
          "snap.avg7Cents",
          "snap.avg30Cents",
          "snap.recordedAt",
        ])
        .where("ps.marketplace", "=", marketplace)
        .where("ps.printingId", "in", printingIds)
        .orderBy("snap.recordedAt", "desc")
        .execute();
    },

    /** Upsert a snapshot row from staging data. */
    async insertSnapshot(
      productId: string,
      row: {
        recordedAt: Date;
        marketCents: number;
        lowCents: number | null;
        midCents: number | null;
        highCents: number | null;
        trendCents: number | null;
        avg1Cents: number | null;
        avg7Cents: number | null;
        avg30Cents: number | null;
      },
    ): Promise<void> {
      await db
        .insertInto("marketplaceSnapshots")
        .values({
          productId,
          recordedAt: row.recordedAt,
          marketCents: row.marketCents,
          lowCents: row.lowCents,
          midCents: row.midCents,
          highCents: row.highCents,
          trendCents: row.trendCents,
          avg1Cents: row.avg1Cents,
          avg7Cents: row.avg7Cents,
          avg30Cents: row.avg30Cents,
        })
        .onConflict((oc) =>
          oc.columns(["productId", "recordedAt"]).doUpdateSet({
            marketCents: sql<number>`excluded.market_cents`,
            lowCents: sql<number | null>`excluded.low_cents`,
            midCents: sql<number | null>`excluded.mid_cents`,
            highCents: sql<number | null>`excluded.high_cents`,
            trendCents: sql<number | null>`excluded.trend_cents`,
            avg1Cents: sql<number | null>`excluded.avg1_cents`,
            avg7Cents: sql<number | null>`excluded.avg7_cents`,
            avg30Cents: sql<number | null>`excluded.avg30_cents`,
          }),
        )
        .execute();
    },

    /** Insert a staging row from a snapshot (used during unmap). */
    async insertStagingFromSnapshot(
      marketplace: string,
      ps: { externalId: number; groupId: number; productName: string },
      finish: string,
      snap: {
        recordedAt: Date;
        marketCents: number;
        lowCents: number | null;
        midCents: number | null;
        highCents: number | null;
        trendCents: number | null;
        avg1Cents: number | null;
        avg7Cents: number | null;
        avg30Cents: number | null;
      },
    ): Promise<void> {
      await db
        .insertInto("marketplaceStaging")
        .values({
          marketplace,
          externalId: ps.externalId,
          groupId: ps.groupId,
          productName: ps.productName,
          finish,
          recordedAt: snap.recordedAt,
          marketCents: snap.marketCents,
          lowCents: snap.lowCents,
          midCents: snap.midCents,
          highCents: snap.highCents,
          trendCents: snap.trendCents,
          avg1Cents: snap.avg1Cents,
          avg7Cents: snap.avg7Cents,
          avg30Cents: snap.avg30Cents,
        })
        .onConflict((oc) =>
          oc.columns(["marketplace", "externalId", "finish", "recordedAt"]).doNothing(),
        )
        .execute();
    },

    /** Bulk-copy all snapshots back to staging for a marketplace (used during unmap-all). */
    async bulkUnmapToStaging(marketplace: string): Promise<void> {
      await sql`
        INSERT INTO marketplace_staging (marketplace, external_id, group_id, product_name, finish, recorded_at,
          market_cents, low_cents, mid_cents, high_cents, trend_cents, avg1_cents, avg7_cents, avg30_cents)
        SELECT s.marketplace, s.external_id, s.group_id, s.product_name, p.finish, snap.recorded_at,
          snap.market_cents, snap.low_cents, snap.mid_cents, snap.high_cents, snap.trend_cents, snap.avg1_cents, snap.avg7_cents, snap.avg30_cents
        FROM marketplace_products s
        JOIN printings p ON p.id = s.printing_id
        JOIN marketplace_snapshots snap ON snap.product_id = s.id
        WHERE s.marketplace = ${marketplace}
          AND s.external_id IS NOT NULL
        ON CONFLICT (marketplace, external_id, finish, recorded_at) DO NOTHING
      `.execute(db);
    },
  };
}

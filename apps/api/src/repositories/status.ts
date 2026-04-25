import type { Kysely } from "kysely";
import { sql } from "kysely";

import type { Database } from "../db/index.js";

interface DbStatus {
  status: string;
  sizeMb: number | null;
  activeConnections: number | null;
  latestMigration: string | null;
  totalMigrations: number;
}

interface AppStats {
  totalUsers: number;
  recentSignups7d: number;
  totalCards: number;
  totalPrintings: number;
  totalSets: number;
  totalCollections: number;
  totalDecks: number;
  totalCopies: number;
}

interface PricingSourceStats {
  marketplace: string;
  products: number;
  variants: number;
  snapshots: number;
  latestSnapshot: string | null;
  stagingRows: number;
  latestStaging: string | null;
}

interface PricingStats {
  totalSnapshots: number;
  sources: PricingSourceStats[];
}

/**
 * Queries for the admin status dashboard.
 * @returns Status repository with database, app stat, and pricing methods.
 */
export function statusRepo(db: Kysely<Database>) {
  return {
    /**
     * Gathers database-level status information.
     * @returns Database status including size, connections, and migration info.
     */
    async getDatabaseStatus(): Promise<DbStatus> {
      try {
        // Database size
        const [sizeRow] = await sql<{ sizeMb: number }>`
          SELECT pg_database_size(current_database()) / (1024 * 1024.0) AS size_mb
        `
          .execute(db)
          .then((r) => r.rows);

        // Active connections
        const [connRow] = await sql<{ count: number }>`
          SELECT count(*)::int AS count FROM pg_stat_activity
          WHERE datname = current_database()
        `
          .execute(db)
          .then((r) => r.rows);

        // Latest migration from Kysely's internal table
        const migrationRows = await sql<{ name: string }>`
          SELECT name FROM kysely_migration ORDER BY name DESC
        `
          .execute(db)
          .then((r) => r.rows);

        const latestMigration = migrationRows[0]?.name ?? null;
        const totalMigrations = migrationRows.length;

        return {
          status: "connected",
          sizeMb: Math.round(sizeRow.sizeMb * 100) / 100,
          activeConnections: connRow.count,
          latestMigration,
          totalMigrations,
        };
      } catch {
        return {
          status: "unreachable",
          sizeMb: null,
          activeConnections: null,
          latestMigration: null,
          totalMigrations: 0,
        };
      }
    },

    /**
     * Gathers application-level statistics.
     * @returns App stats including user, card, and collection counts.
     */
    async getAppStats(): Promise<AppStats> {
      const [users] = await sql<{ total: number; recent: number }>`
        SELECT
          count(*)::int AS total,
          count(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS recent
        FROM users
      `
        .execute(db)
        .then((r) => r.rows);

      const countFrom = async (table: string): Promise<number> => {
        const [row] = await sql<{ count: number }>`
          SELECT count(*)::int AS count FROM ${sql.ref(table)}
        `
          .execute(db)
          .then((r) => r.rows);
        return row.count;
      };

      const [totalCards, totalPrintings, totalSets, totalCollections, totalDecks, totalCopies] =
        await Promise.all([
          countFrom("cards"),
          countFrom("printings"),
          countFrom("sets"),
          countFrom("collections"),
          countFrom("decks"),
          countFrom("copies"),
        ]);

      return {
        totalUsers: users.total,
        recentSignups7d: users.recent,
        totalCards,
        totalPrintings,
        totalSets,
        totalCollections,
        totalDecks,
        totalCopies,
      };
    },

    /**
     * Gathers pricing/marketplace statistics per source. Snapshots are
     * reported from `marketplace_product_prices` (one row per SKU per
     * recorded_at) — a notable drop from the old per-variant count once
     * sibling bindings no longer fan snapshots out.
     * @returns Product counts, price-row counts, and latest recorded_at per marketplace.
     */
    async getPricingStats(): Promise<PricingStats> {
      const [productRows, stagingRows] = await Promise.all([
        sql<{
          marketplace: string;
          products: number;
          variants: number;
          snapshots: number;
          latestSnapshot: string | null;
        }>`
          SELECT
            mp.marketplace,
            count(DISTINCT mp.id)::int AS products,
            count(DISTINCT mpv.id)::int AS variants,
            count(pp.*)::int AS snapshots,
            max(pp.recorded_at)::text AS latest_snapshot
          FROM marketplace_products mp
          LEFT JOIN marketplace_product_variants mpv ON mpv.marketplace_product_id = mp.id
          LEFT JOIN marketplace_product_prices pp ON pp.marketplace_product_id = mp.id
          GROUP BY mp.marketplace
          ORDER BY mp.marketplace
        `
          .execute(db)
          .then((r) => r.rows),
        sql<{
          marketplace: string;
          stagingRows: number;
          latestStaging: string | null;
        }>`
          SELECT
            marketplace,
            count(*)::int AS staging_rows,
            max(recorded_at)::text AS latest_staging
          FROM marketplace_staging
          GROUP BY marketplace
        `
          .execute(db)
          .then((r) => r.rows),
      ]);

      const stagingByMarketplace = new Map(stagingRows.map((row) => [row.marketplace, row]));

      const totalSnapshots = productRows.reduce((sum, row) => sum + row.snapshots, 0);

      return {
        totalSnapshots,
        sources: productRows.map((row) => {
          const staging = stagingByMarketplace.get(row.marketplace);
          return {
            marketplace: row.marketplace,
            products: row.products,
            variants: row.variants,
            snapshots: row.snapshots,
            latestSnapshot: row.latestSnapshot,
            stagingRows: staging?.stagingRows ?? 0,
            latestStaging: staging?.latestStaging ?? null,
          };
        }),
      };
    },
  };
}

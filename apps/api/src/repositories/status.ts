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
  /** Row count in `marketplace_product_prices` for this marketplace. */
  prices: number;
  latestPrice: string | null;
}

interface PricingStats {
  totalPrices: number;
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
        // ::float8 because the numeric division would come back as a string.
        const [sizeRow] = await sql<{ sizeMb: number }>`
          SELECT (pg_database_size(current_database()) / (1024 * 1024.0))::float8 AS size_mb
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
     * Gathers pricing/marketplace statistics per source. Counts come from
     * `marketplace_product_prices` (one row per SKU per recorded_at).
     *
     * The price aggregate runs as its own query rather than a third join in
     * the product query. Variants and prices both hang off a product, so
     * joining them together multiplies each product's price rows by its
     * variant count — the dev database reported 519354 cardmarket price rows
     * against 270817 real ones.
     *
     * @returns Product counts, price-row counts, and latest recorded_at per marketplace.
     */
    async getPricingStats(): Promise<PricingStats> {
      const [productRows, priceRows] = await Promise.all([
        db
          .selectFrom("marketplaceProducts as mp")
          .leftJoin("marketplaceProductVariants as mpv", "mpv.marketplaceProductId", "mp.id")
          .select((eb) => [
            "mp.marketplace as marketplace",
            eb.cast<number>(eb.fn.count("mp.id").distinct(), "integer").as("products"),
            eb.cast<number>(eb.fn.count("mpv.id").distinct(), "integer").as("variants"),
          ])
          .groupBy("mp.marketplace")
          .orderBy("mp.marketplace")
          .execute(),
        db
          .selectFrom("marketplaceProductPrices as pp")
          .innerJoin("marketplaceProducts as mp", "mp.id", "pp.marketplaceProductId")
          .select((eb) => [
            "mp.marketplace as marketplace",
            eb.cast<number>(eb.fn.countAll(), "integer").as("prices"),
            eb.cast<string>(eb.fn.max("pp.recordedAt"), "text").as("latestPrice"),
          ])
          .groupBy("mp.marketplace")
          .execute(),
      ]);

      const pricesByMarketplace = new Map(priceRows.map((row) => [row.marketplace, row]));

      const sources = productRows.map((row) => {
        const prices = pricesByMarketplace.get(row.marketplace);
        return {
          marketplace: row.marketplace,
          products: row.products,
          variants: row.variants,
          prices: prices?.prices ?? 0,
          latestPrice: prices?.latestPrice ?? null,
        };
      });

      return {
        totalPrices: sources.reduce((sum, source) => sum + source.prices, 0),
        sources,
      };
    },
  };
}

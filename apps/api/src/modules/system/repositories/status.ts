import type { Kysely } from "kysely";
import { sql } from "kysely";

import type { Database } from "../../../db/tables.js";
import { META_ARCHIVE_USER_ID } from "../../meta/repositories/meta-shared.js";

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
  totalUserDecks: number;
  totalMetaDecks: number;
  totalWishlists: number;
  totalTradelists: number;
  totalFriendGroups: number;
  totalCopies: number;
}

interface PricingSourceStats {
  marketplace: string;
  products: number;
  variants: number;
  prices: number;
  latestPrice: string | null;
}

interface PricingStats {
  totalPrices: number;
  sources: PricingSourceStats[];
}

export function statusRepo(db: Kysely<Database>) {
  return {
    async getDatabaseStatus(): Promise<DbStatus> {
      try {
        // ::float8 because the numeric division would come back as a string.
        const [sizeRow] = await sql<{ sizeMb: number }>`
          SELECT (pg_database_size(current_database()) / (1024 * 1024.0))::float8 AS size_mb
        `
          .execute(db)
          .then((r) => r.rows);

        const [connRow] = await sql<{ count: number }>`
          SELECT count(*)::int AS count FROM pg_stat_activity
          WHERE datname = current_database()
        `
          .execute(db)
          .then((r) => r.rows);

        if (!sizeRow || !connRow) {
          throw new Error("database status query returned no rows");
        }

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

    async getAppStats(): Promise<AppStats> {
      const [users] = await sql<{ total: number; recent: number }>`
        SELECT
          count(*)::int AS total,
          count(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS recent
        FROM users
      `
        .execute(db)
        .then((r) => r.rows);

      if (!users) {
        throw new Error("app stats user query returned no rows");
      }

      const countFrom = async (table: string): Promise<number> => {
        const [row] = await sql<{ count: number }>`
          SELECT count(*)::int AS count FROM ${sql.ref(table)}
        `
          .execute(db)
          .then((r) => r.rows);
        if (!row) {
          throw new Error(`count query returned no rows for ${table}`);
        }
        return row.count;
      };

      const [
        totalCards,
        totalPrintings,
        totalSets,
        totalCollections,
        totalFriendGroups,
        totalCopies,
        deckCounts,
        listCounts,
      ] = await Promise.all([
        countFrom("cards"),
        countFrom("printings"),
        countFrom("sets"),
        countFrom("collections"),
        countFrom("friend_groups"),
        countFrom("copies"),
        db
          .selectFrom("decks")
          .select((eb) => [
            eb
              .cast<number>(
                eb.fn.count("id").filterWhere("userId", "=", META_ARCHIVE_USER_ID),
                "integer",
              )
              .as("meta"),
            eb
              .cast<number>(
                eb.fn.count("id").filterWhere("userId", "!=", META_ARCHIVE_USER_ID),
                "integer",
              )
              .as("user"),
          ])
          .executeTakeFirstOrThrow(),
        db
          .selectFrom("lists")
          .select((eb) => [
            eb
              .cast<number>(eb.fn.count("id").filterWhere("intent", "=", "wish"), "integer")
              .as("wish"),
            eb
              .cast<number>(eb.fn.count("id").filterWhere("intent", "=", "trade"), "integer")
              .as("trade"),
          ])
          .executeTakeFirstOrThrow(),
      ]);

      return {
        totalUsers: users.total,
        recentSignups7d: users.recent,
        totalCards,
        totalPrintings,
        totalSets,
        totalCollections,
        totalUserDecks: deckCounts.user,
        totalMetaDecks: deckCounts.meta,
        totalWishlists: listCounts.wish,
        totalTradelists: listCounts.trade,
        totalFriendGroups,
        totalCopies,
      };
    },

    /**
     * Runs as its own query: variants and prices both hang off a product, so
     * joining all three would multiply each product's price rows by its variant count.
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

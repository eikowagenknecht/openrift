import { WellKnown } from "@openrift/shared/well-known";
import type { Kysely, Selectable } from "kysely";
import { sql } from "kysely";

import type { Database } from "../../../db/tables.js";
import type { MarketplaceProductPricesTable } from "../../../db/tables/marketplace.js";

/**
 * Price queries read from `mv_daily_printing_prices` and its latest-day
 * derivative `mv_latest_printing_prices`, both refreshed after each
 * price-refresh pipeline run (see {@link refreshLatestPrices}). The headline
 * rule and the "cheapest bound SKU" aggregation live in the daily view, so
 * every surface that prices a printing agrees by construction. Don't
 * re-implement the headline CASE in a query here.
 */
export function marketplacePricesRepo(db: Kysely<Database>) {
  return {
    /**
     * `lastSeen` is the day the price was observed, not the day it was read.
     * The pipeline writes a snapshot only when a marketplace returns data, so
     * a delisted card keeps its final price indefinitely and looks current.
     */
    latestPrices(): Promise<
      { printingId: string; marketplace: string; marketCents: number; lastSeen: string }[]
    > {
      return db
        .selectFrom("mvLatestPrintingPrices")
        .select(["printingId", "marketplace", "headlineCents as marketCents", "lastSeen"])
        .execute();
    },

    /**
     * Cheap content token over {@link latestPrices}, for the content-addressed
     * price memo in `createRepos` (dynamic list rules that filter on price).
     * Hashes the materialized view itself — not the base snapshot tables — so
     * the token rolls exactly when {@link refreshLatestPrices} publishes new
     * data. A base-table probe would roll mid-pipeline (inserts land before
     * the refresh), caching the old view under the new token and then serving
     * it stale after the refresh until the next pipeline run.
     */
    async latestPricesContentVersion(): Promise<string> {
      const result = await sql<{ token: string }>`
        SELECT
          coalesce(count(*)::text, '0') || '|' ||
          coalesce(md5(string_agg(printing_id::text || ':' || marketplace || ':' || headline_cents::text || ':' || last_seen::text, ',' ORDER BY printing_id, marketplace)), '') AS token
        FROM mv_latest_printing_prices
      `.execute(db);
      return result.rows[0]?.token ?? "";
    },

    latestPricesForPrintings(
      printingIds: string[],
    ): Promise<{ printingId: string; marketplace: string; marketCents: number }[]> {
      if (printingIds.length === 0) {
        return Promise.resolve([]);
      }
      return db
        .selectFrom("mvLatestPrintingPrices")
        .select(["printingId", "marketplace", "headlineCents as marketCents"])
        .where("printingId", "in", printingIds)
        .execute();
    },

    /**
     * Marketplace variants bound to a printing. Cross-language aggregates are
     * materialised as explicit variant rows, so a printing sees exactly the
     * variants that carry its own `printing_id` — there is no sibling fan-out
     * here. `language` is the parent product's SKU axis, and is `null` on the
     * marketplaces that don't split by language (CM/TCG), which is how callers
     * still recognise an aggregate.
     */
    sourcesForPrinting(printingId: string): Promise<
      {
        variantId: string;
        externalId: number;
        marketplace: string;
        language: string | null;
      }[]
    > {
      return db
        .selectFrom("marketplaceProductVariants as mpv")
        .innerJoin("marketplaceProducts as mp", "mp.id", "mpv.marketplaceProductId")
        .select([
          "mpv.id as variantId",
          "mp.externalId as externalId",
          "mp.marketplace as marketplace",
          "mp.language as language",
        ])
        .where("mpv.printingId", "=", printingId)
        .execute();
    },

    sourcesForPrintings(printingIds: string[]): Promise<
      {
        printingId: string;
        externalId: number;
        marketplace: string;
      }[]
    > {
      if (printingIds.length === 0) {
        return Promise.resolve([]);
      }
      return db
        .selectFrom("marketplaceProductVariants as mpv")
        .innerJoin("marketplaceProducts as mp", "mp.id", "mpv.marketplaceProductId")
        .select([
          "mpv.printingId as printingId",
          "mp.externalId as externalId",
          "mp.marketplace as marketplace",
        ])
        .where("mpv.printingId", "in", printingIds)
        .execute();
    },

    /**
     * Price history for the product a variant is bound to. Every variant for
     * the same SKU resolves to the same history — prices live on the product,
     * not the binding.
     */
    snapshots(
      variantId: string,
      cutoff: Date | null,
    ): Promise<
      Pick<
        Selectable<MarketplaceProductPricesTable>,
        "recordedAt" | "marketCents" | "lowCents" | "zeroLowCents"
      >[]
    > {
      let query = db
        .selectFrom("marketplaceProductPrices as pp")
        .innerJoin(
          "marketplaceProductVariants as mpv",
          "mpv.marketplaceProductId",
          "pp.marketplaceProductId",
        )
        .select(["pp.recordedAt", "pp.marketCents", "pp.lowCents", "pp.zeroLowCents"])
        .where("mpv.id", "=", variantId)
        .orderBy("pp.recordedAt", "asc");
      if (cutoff) {
        query = query.where("pp.recordedAt", ">=", cutoff);
      }
      return query.execute();
    },

    /**
     * Overflow is skipped — it's a parking zone for cards the user hasn't
     * committed to the deck, and the deck editor leaves it out of its own
     * value figure too (see `computeDeckOwnership` in the web app).
     *
     * `languages` mirrors `cheapestPrice` in the web app's
     * `computeDeckOwnership` exactly, so a deck tile and the deck page quote
     * the same basis: the cheapest priced printing whose language the viewer
     * collects, falling back to the cheapest priced printing in any language
     * when the card has none priced in those. This matters on marketplaces
     * with per-language prices (CardTrader) — without it a cheap foreign
     * printing drags the tile below what the deck page shows. An empty list
     * means "no language preference" and prices at the plain cheapest.
     */
    async deckValues(
      userId: string,
      marketplace: string,
      languages?: readonly string[],
    ): Promise<Map<string, number>> {
      const preferredLanguages = [...(languages ?? [])];
      const rows = await sql<{ deckId: string; totalValueCents: number }>`
        SELECT
          dc.deck_id AS "deckId",
          COALESCE(SUM(dc.quantity * cheapest.headline_cents), 0)::int AS "totalValueCents"
        FROM deck_cards dc
        INNER JOIN decks d ON d.id = dc.deck_id AND d.user_id = ${userId}
        LEFT JOIN LATERAL (
          SELECT COALESCE(
            MIN(mvp.headline_cents) FILTER (
              WHERE p.language = ANY(${preferredLanguages}::text[])
            ),
            MIN(mvp.headline_cents)
          ) AS headline_cents
          FROM printings p
          INNER JOIN mv_latest_printing_prices mvp
            ON mvp.printing_id = p.id AND mvp.marketplace = ${marketplace}
          WHERE p.card_id = dc.card_id
        ) cheapest ON true
        WHERE dc.zone <> ${WellKnown.deckZone.OVERFLOW}
        GROUP BY dc.deck_id
      `.execute(db);

      return new Map(rows.rows.map((row) => [row.deckId, row.totalValueCents]));
    },

    /**
     * Order matters: `mv_latest_printing_prices` is defined over
     * `mv_daily_printing_prices`, so refreshing it reads whatever the daily
     * view currently holds. Daily first, or the latest view republishes
     * yesterday's data under today's content token.
     */
    async refreshLatestPrices(): Promise<void> {
      await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_printing_prices`.execute(db);
      await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY mv_latest_printing_prices`.execute(db);
    },
  };
}

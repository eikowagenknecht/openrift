import type { Kysely, Selectable } from "kysely";
import { sql } from "kysely";

import type { Database, MarketplaceProductPricesTable } from "../db/index.js";

interface CollectionValueHistoryPoint {
  date: string;
  valueCents: number;
  copyCount: number;
}

interface ScopeFilter {
  sets?: string[];
  languages?: string[];
  domains?: string[];
  types?: string[];
  rarities?: string[];
  finishes?: string[];
  artVariants?: string[];
  promos?: "only" | "exclude";
  signed?: boolean;
  banned?: boolean;
  errata?: boolean;
}

export interface CollectionValue {
  collectionId: string;
  totalValueCents: number;
  unpricedCopyCount: number;
}

/**
 * Read-only queries for marketplace prices and snapshots.
 *
 * Price queries read from the `mv_latest_printing_prices` materialized view,
 * which must be refreshed after each price-refresh pipeline run (see
 * {@link refreshLatestPrices}).
 *
 * @returns An object with marketplace query methods bound to the given `db`.
 */
export function marketplaceRepo(db: Kysely<Database>) {
  return {
    /**
     * Latest headline price per marketplace for every printing.
     *
     * Reads from the `mv_latest_printing_prices` materialized view, which
     * pre-computes the sibling self-join + DISTINCT ON from raw snapshot data.
     *
     * @returns Rows with `printingId`, `marketplace`, and the headline price as `marketCents`.
     */
    latestPrices(): Promise<{ printingId: string; marketplace: string; marketCents: number }[]> {
      return db
        .selectFrom("mvLatestPrintingPrices")
        .select(["printingId", "marketplace", "headlineCents as marketCents"])
        .execute();
    },

    /**
     * Latest headline price per marketplace for a subset of printings.
     *
     * Same data as {@link latestPrices} but filtered to the given printing IDs.
     *
     * @returns Rows with `printingId`, `marketplace`, and the headline price as `marketCents`.
     */
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
     * @returns Marketplace variants linked to a printing, including cross-language
     *          aggregate variants attached to any sibling printing. The `language`
     *          field is `null` for aggregate variants so callers can label them.
     */
    async sourcesForPrinting(printingId: string): Promise<
      {
        variantId: string;
        externalId: number;
        marketplace: string;
        language: string | null;
      }[]
    > {
      const result = await sql<{
        variantId: string;
        externalId: number;
        marketplace: string;
        language: string | null;
      }>`
        SELECT
          mpv.id as "variantId",
          mp.external_id as "externalId",
          mp.marketplace as "marketplace",
          mp.language as "language"
        FROM marketplace_product_variants mpv
        JOIN marketplace_products mp ON mp.id = mpv.marketplace_product_id
        WHERE mpv.printing_id = ${printingId}
      `.execute(db);
      return result.rows;
    },

    /**
     * Batch version of {@link sourcesForPrinting}. Returns marketplace source rows
     * for each given printing, tagged with the target `printingId` so callers can
     * group by printing without replaying the sibling fan-out join client-side.
     *
     * @returns Rows keyed by the requested `printingId`.
     */
    async sourcesForPrintings(printingIds: string[]): Promise<
      {
        printingId: string;
        externalId: number;
        marketplace: string;
      }[]
    > {
      if (printingIds.length === 0) {
        return [];
      }
      const result = await sql<{
        printingId: string;
        externalId: number;
        marketplace: string;
      }>`
        SELECT
          mpv.printing_id as "printingId",
          mp.external_id as "externalId",
          mp.marketplace as "marketplace"
        FROM marketplace_product_variants mpv
        JOIN marketplace_products mp ON mp.id = mpv.marketplace_product_id
        WHERE mpv.printing_id = ANY(${printingIds}::uuid[])
      `.execute(db);
      return result.rows;
    },

    /**
     * Price history for the product a variant is bound to. Every variant for
     * the same SKU resolves to the same history — prices live on the product,
     * not the binding.
     * @returns Rows for the variant's parent product, optionally filtered by
     *          a cutoff date, ordered chronologically.
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
     * Total market value per deck for a user.
     *
     * Uses the cheapest printing of each card (from the materialized view)
     * to estimate what it would cost to buy the deck on a given marketplace.
     *
     * @returns A map from deck ID to total value in cents.
     */
    async deckValues(userId: string, marketplace: string): Promise<Map<string, number>> {
      const rows = await sql<{ deckId: string; totalValueCents: number }>`
        SELECT
          dc.deck_id AS "deckId",
          COALESCE(SUM(dc.quantity * cheapest.headline_cents), 0)::int AS "totalValueCents"
        FROM deck_cards dc
        INNER JOIN decks d ON d.id = dc.deck_id AND d.user_id = ${userId}
        LEFT JOIN LATERAL (
          SELECT MIN(mvp.headline_cents) AS headline_cents
          FROM printings p
          INNER JOIN mv_latest_printing_prices mvp
            ON mvp.printing_id = p.id AND mvp.marketplace = ${marketplace}
          WHERE p.card_id = dc.card_id
        ) cheapest ON true
        GROUP BY dc.deck_id
      `.execute(db);

      return new Map(rows.rows.map((row) => [row.deckId, row.totalValueCents]));
    },

    /**
     * Total market value and unpriced copy count per collection for a user.
     *
     * @returns A map from collection ID to value data.
     */
    async collectionValues(
      userId: string,
      marketplace: string,
    ): Promise<Map<string, CollectionValue>> {
      const rows = await sql<CollectionValue>`
        SELECT
          cp.collection_id AS "collectionId",
          COALESCE(SUM(mvp.headline_cents), 0)::int AS "totalValueCents",
          (COUNT(cp.id) - COUNT(mvp.headline_cents))::int AS "unpricedCopyCount"
        FROM copies cp
        LEFT JOIN mv_latest_printing_prices mvp
          ON mvp.printing_id = cp.printing_id AND mvp.marketplace = ${marketplace}
        WHERE cp.user_id = ${userId}
        GROUP BY cp.collection_id
      `.execute(db);

      return new Map(rows.rows.map((row) => [row.collectionId, row]));
    },

    /**
     * Total market value and unpriced copy count for a single collection.
     *
     * @returns Value data for the collection, or undefined if it has no copies.
     */
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

    /**
     * Collection value over time, computed from collection events and price snapshots.
     *
     * Replays collection events to reconstruct the set of printings at each day,
     * then multiplies by that day's prices to produce a time series.
     *
     * @returns Daily value points for charting.
     */
    async collectionValueTimeSeries(params: {
      userId: string;
      marketplace: string;
      collectionIds: string[] | null;
      cutoff: Date | null;
      scope: ScopeFilter;
    }): Promise<CollectionValueHistoryPoint[]> {
      const { userId, marketplace, collectionIds, cutoff, scope } = params;

      // ── Query A: collection events with scope filters ──────────────────
      // Build scope filter clauses. Each array filter uses a parameterized
      // IN-list via sql.join to avoid SQL injection from user-provided values.
      const scopeClauses: ReturnType<typeof sql>[] = [];
      if (collectionIds) {
        const ids = sql.join(collectionIds.map((id) => sql`${id}::uuid`));
        scopeClauses.push(
          sql`AND (ce.to_collection_id IN (${ids}) OR ce.from_collection_id IN (${ids}))`,
        );
      }
      if (scope.sets?.length) {
        const vals = sql.join(scope.sets.map((val) => sql`${val}`));
        scopeClauses.push(sql`AND s.slug IN (${vals})`);
      }
      if (scope.languages?.length) {
        const vals = sql.join(scope.languages.map((val) => sql`${val}`));
        scopeClauses.push(sql`AND p.language IN (${vals})`);
      }
      if (scope.types?.length) {
        const vals = sql.join(scope.types.map((val) => sql`${val}`));
        scopeClauses.push(sql`AND c.type IN (${vals})`);
      }
      if (scope.rarities?.length) {
        const vals = sql.join(scope.rarities.map((val) => sql`${val}`));
        scopeClauses.push(sql`AND p.rarity IN (${vals})`);
      }
      if (scope.finishes?.length) {
        const vals = sql.join(scope.finishes.map((val) => sql`${val}`));
        scopeClauses.push(sql`AND p.finish IN (${vals})`);
      }
      if (scope.artVariants?.length) {
        const vals = sql.join(scope.artVariants.map((val) => sql`${val}`));
        scopeClauses.push(sql`AND p.art_variant IN (${vals})`);
      }
      if (scope.domains?.length) {
        const vals = sql.join(scope.domains.map((val) => sql`${val}`));
        scopeClauses.push(
          sql`AND EXISTS (SELECT 1 FROM card_domains cd WHERE cd.card_id = c.id AND cd.domain_slug IN (${vals}))`,
        );
      }
      if (scope.promos === "only") {
        scopeClauses.push(sql`AND cardinality(p.marker_slugs) > 0`);
      } else if (scope.promos === "exclude") {
        scopeClauses.push(sql`AND cardinality(p.marker_slugs) = 0`);
      }
      if (scope.signed === true) {
        scopeClauses.push(sql`AND p.is_signed = true`);
      } else if (scope.signed === false) {
        scopeClauses.push(sql`AND p.is_signed = false`);
      }
      if (scope.banned === true) {
        scopeClauses.push(
          sql`AND EXISTS (SELECT 1 FROM card_bans cb WHERE cb.card_id = c.id AND cb.unbanned_at IS NULL)`,
        );
      } else if (scope.banned === false) {
        scopeClauses.push(
          sql`AND NOT EXISTS (SELECT 1 FROM card_bans cb WHERE cb.card_id = c.id AND cb.unbanned_at IS NULL)`,
        );
      }
      if (scope.errata === true) {
        scopeClauses.push(sql`AND EXISTS (SELECT 1 FROM card_errata ce2 WHERE ce2.card_id = c.id)`);
      } else if (scope.errata === false) {
        scopeClauses.push(
          sql`AND NOT EXISTS (SELECT 1 FROM card_errata ce2 WHERE ce2.card_id = c.id)`,
        );
      }

      const scopeFragment = scopeClauses.length > 0 ? sql.join(scopeClauses, sql` `) : sql``;

      const events = await sql<{
        action: string;
        printingId: string;
        fromCollectionId: string | null;
        toCollectionId: string | null;
        createdAt: Date;
      }>`
        SELECT
          ce.action,
          ce.printing_id AS "printingId",
          ce.from_collection_id AS "fromCollectionId",
          ce.to_collection_id AS "toCollectionId",
          ce.created_at AS "createdAt"
        FROM collection_events ce
        INNER JOIN printings p ON p.id = ce.printing_id
        INNER JOIN cards c ON c.id = p.card_id
        INNER JOIN sets s ON s.id = p.set_id
        WHERE ce.user_id = ${userId}
          ${scopeFragment}
        ORDER BY ce.created_at ASC
      `.execute(db);

      if (events.rows.length === 0) {
        return [];
      }

      // Collect unique printing IDs from events
      const printingIds = [...new Set(events.rows.map((e) => e.printingId))];

      // ── Query B: daily prices for those printings ──────────────────────
      // Mirrors mv_latest_printing_prices' headline rule per marketplace but
      // grouped by day instead of "latest overall". For CardTrader that's
      // COALESCE(zero_low_cents, low_cents) — prefer Zero-eligible pricing,
      // fall back to overall-low per day. For TCG/CM it's
      // COALESCE(market_cents, low_cents). Snapshots from before the Zero
      // column existed (migration 099) have zero_low_cents=null and
      // naturally fall back to low_cents.
      const headlineExpr =
        marketplace === "cardtrader"
          ? sql`COALESCE(pp.zero_low_cents, pp.low_cents)`
          : sql`COALESCE(pp.market_cents, pp.low_cents)`;
      const dailyPrices = await sql<{
        printingId: string;
        day: string;
        headlineCents: number;
      }>`
        SELECT DISTINCT ON (mpv.printing_id, day)
          mpv.printing_id AS "printingId",
          date_trunc('day', pp.recorded_at)::date::text AS day,
          ${headlineExpr} AS "headlineCents"
        FROM marketplace_product_variants mpv
        JOIN marketplace_products mp ON mp.id = mpv.marketplace_product_id
        JOIN marketplace_product_prices pp ON pp.marketplace_product_id = mp.id
        WHERE mpv.printing_id IN (${sql.join(printingIds.map((id) => sql`${id}::uuid`))})
          AND mp.marketplace = ${marketplace}
          AND ${headlineExpr} IS NOT NULL
        ORDER BY mpv.printing_id, day, pp.recorded_at DESC
      `.execute(db);

      // Build a lookup: printingId -> day -> headlineCents
      const priceMap = new Map<string, Map<string, number>>();
      for (const row of dailyPrices.rows) {
        let dayMap = priceMap.get(row.printingId);
        if (!dayMap) {
          dayMap = new Map();
          priceMap.set(row.printingId, dayMap);
        }
        dayMap.set(row.day, row.headlineCents);
      }

      // ── TypeScript replay ─────────────────────────────────────────────
      // Determine the target collection set for filtering events
      const targetCollectionSet = collectionIds ? new Set(collectionIds) : null;

      // Classify event as +1 or -1 relative to target collections
      function eventDelta(event: (typeof events.rows)[0]): number {
        if (targetCollectionSet) {
          const toTarget = event.toCollectionId
            ? targetCollectionSet.has(event.toCollectionId)
            : false;
          const fromTarget = event.fromCollectionId
            ? targetCollectionSet.has(event.fromCollectionId)
            : false;

          if (event.action === "added" && toTarget) {
            return 1;
          }
          if (event.action === "removed" && fromTarget) {
            return -1;
          }
          if (event.action === "moved") {
            if (toTarget && !fromTarget) {
              return 1;
            }
            if (fromTarget && !toTarget) {
              return -1;
            }
          }
          return 0;
        }
        // All collections mode
        if (event.action === "added") {
          return 1;
        }
        if (event.action === "removed") {
          return -1;
        }
        return 0; // moved between collections = no net change
      }

      // Determine date range
      const startDate = cutoff
        ? new Date(Math.max(cutoff.getTime(), events.rows[0].createdAt.getTime()))
        : events.rows[0].createdAt;
      const endDate = new Date();
      const startDay = toDateString(startDate);
      const endDay = toDateString(endDate);

      // Replay all events, building daily snapshots
      const composition = new Map<string, number>(); // printingId -> count
      let eventIndex = 0;

      // First, replay events before the start day to establish initial state
      while (eventIndex < events.rows.length) {
        const event = events.rows[eventIndex];
        if (toDateString(event.createdAt) >= startDay) {
          break;
        }
        const delta = eventDelta(event);
        if (delta !== 0) {
          const current = composition.get(event.printingId) ?? 0;
          const newCount = current + delta;
          if (newCount <= 0) {
            composition.delete(event.printingId);
          } else {
            composition.set(event.printingId, newCount);
          }
        }
        eventIndex++;
      }

      // Walk day by day from start to end
      const series: CollectionValueHistoryPoint[] = [];
      const currentDay = new Date(startDay);
      const lastPriceByPrinting = new Map<string, number>(); // carry-forward prices

      while (toDateString(currentDay) <= endDay) {
        const dayStr = toDateString(currentDay);

        // Apply events for this day
        while (eventIndex < events.rows.length) {
          const event = events.rows[eventIndex];
          if (toDateString(event.createdAt) > dayStr) {
            break;
          }
          const delta = eventDelta(event);
          if (delta !== 0) {
            const current = composition.get(event.printingId) ?? 0;
            const newCount = current + delta;
            if (newCount <= 0) {
              composition.delete(event.printingId);
            } else {
              composition.set(event.printingId, newCount);
            }
          }
          eventIndex++;
        }

        // Update carry-forward prices for this day
        for (const printingId of composition.keys()) {
          const dayPrice = priceMap.get(printingId)?.get(dayStr);
          if (dayPrice !== undefined) {
            lastPriceByPrinting.set(printingId, dayPrice);
          }
        }

        // Compute value
        let valueCents = 0;
        let copyCount = 0;
        for (const [printingId, count] of composition) {
          const price = lastPriceByPrinting.get(printingId);
          if (price !== undefined) {
            valueCents += price * count;
          }
          copyCount += count;
        }

        // Only emit points once the collection has cards (skip days where
        // all adds were cancelled by removes, e.g. early testing activity).
        if (copyCount > 0 || series.length > 0) {
          series.push({ date: dayStr, valueCents, copyCount });
        }

        currentDay.setUTCDate(currentDay.getUTCDate() + 1);
      }

      return series;
    },

    /**
     * Refresh the `mv_latest_printing_prices` materialized view.
     * Uses CONCURRENTLY so reads aren't blocked during refresh.
     *
     * @returns void
     */
    async refreshLatestPrices(): Promise<void> {
      await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY mv_latest_printing_prices`.execute(db);
    },
  };
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

import type { Kysely, Selectable } from "kysely";
import { sql } from "kysely";

import type { Database, MarketplaceSnapshotsTable } from "../db/index.js";

export interface CollectionValue {
  collectionId: string;
  totalValueCents: number;
  unpricedCopyCount: number;
}

/**
 * Read-only queries for marketplace prices and snapshots.
 *
 * @returns An object with marketplace query methods bound to the given `db`.
 */
export function marketplaceRepo(db: Kysely<Database>) {
  return {
    /**
     * Latest headline price per marketplace for every printing.
     *
     * Uses `DISTINCT ON` to efficiently pick only the most recent snapshot
     * per variant without scanning the full `marketplace_snapshots` table.
     * Coalesces `market_cents` with `low_cents` so marketplaces without a true
     * market price (e.g. cardtrader) fall back to their lowest listing.
     *
     * @returns Rows with `printingId`, `marketplace`, and the headline price as `marketCents`.
     */
    latestPrices(): Promise<{ printingId: string; marketplace: string; marketCents: number }[]> {
      return db
        .selectFrom("marketplaceProductVariants as mpv")
        .innerJoin("marketplaceProducts as mp", "mp.id", "mpv.marketplaceProductId")
        .innerJoin("marketplaceSnapshots as snap", "snap.variantId", "mpv.id")
        .distinctOn("mpv.id")
        .select([
          "mpv.printingId as printingId",
          "mp.marketplace",
          sql<number>`coalesce(snap.market_cents, snap.low_cents)`.as("marketCents"),
        ])
        .where(sql<boolean>`coalesce(snap.market_cents, snap.low_cents) is not null`)
        .orderBy("mpv.id")
        .orderBy("snap.recordedAt", "desc")
        .execute();
    },

    /**
     * Latest headline price per marketplace for a subset of printings.
     *
     * Same logic as {@link latestPrices} but filtered to the given printing IDs.
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
        .selectFrom("marketplaceProductVariants as mpv")
        .innerJoin("marketplaceProducts as mp", "mp.id", "mpv.marketplaceProductId")
        .innerJoin("marketplaceSnapshots as snap", "snap.variantId", "mpv.id")
        .where("mpv.printingId", "in", printingIds)
        .where(sql<boolean>`coalesce(snap.market_cents, snap.low_cents) is not null`)
        .distinctOn("mpv.id")
        .select([
          "mpv.printingId as printingId",
          "mp.marketplace",
          sql<number>`coalesce(snap.market_cents, snap.low_cents)`.as("marketCents"),
        ])
        .orderBy("mpv.id")
        .orderBy("snap.recordedAt", "desc")
        .execute();
    },

    /** @returns Marketplace variants (one per SKU) linked to a printing, with parent-product external_id. */
    sourcesForPrinting(
      printingId: string,
    ): Promise<{ variantId: string; externalId: number; marketplace: string }[]> {
      return db
        .selectFrom("marketplaceProductVariants as mpv")
        .innerJoin("marketplaceProducts as mp", "mp.id", "mpv.marketplaceProductId")
        .select([
          "mpv.id as variantId",
          "mp.externalId as externalId",
          "mp.marketplace as marketplace",
        ])
        .where("mpv.printingId", "=", printingId)
        .execute();
    },

    /** @returns Snapshots for a single variant, optionally filtered by a cutoff date, ordered chronologically. */
    snapshots(
      variantId: string,
      cutoff: Date | null,
    ): Promise<
      Pick<Selectable<MarketplaceSnapshotsTable>, "recordedAt" | "marketCents" | "lowCents">[]
    > {
      let query = db
        .selectFrom("marketplaceSnapshots")
        .select(["recordedAt", "marketCents", "lowCents"])
        .where("variantId", "=", variantId)
        .orderBy("recordedAt", "asc");
      if (cutoff) {
        query = query.where("recordedAt", ">=", cutoff);
      }
      return query.execute();
    },

    /**
     * Total market value per deck for a user.
     *
     * Uses the cheapest printing of each card to estimate what it would cost
     * to buy the deck on the given marketplace.
     *
     * @returns A map from deck ID to total value in cents.
     */
    async deckValues(userId: string, marketplace: string): Promise<Map<string, number>> {
      const rows = await sql<{ deckId: string; totalValueCents: number }>`
        select
          dc.deck_id as "deckId",
          coalesce(sum(dc.quantity * cheapest.headline_cents), 0)::int as "totalValueCents"
        from deck_cards dc
        inner join decks d on d.id = dc.deck_id and d.user_id = ${userId}
        left join lateral (
          select min(latest.headline_cents) as headline_cents
          from printings p
          inner join marketplace_product_variants mpv on mpv.printing_id = p.id
          inner join marketplace_products mp
            on mp.id = mpv.marketplace_product_id and mp.marketplace = ${marketplace}
          inner join lateral (
            select coalesce(ms.market_cents, ms.low_cents) as headline_cents
            from marketplace_snapshots ms
            where ms.variant_id = mpv.id
            order by ms.recorded_at desc
            limit 1
          ) latest on true
          where p.card_id = dc.card_id
        ) cheapest on true
        group by dc.deck_id
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
        select
          cp.collection_id as "collectionId",
          coalesce(sum(snap.headline_cents), 0)::int as "totalValueCents",
          (count(cp.id) - count(snap.headline_cents))::int as "unpricedCopyCount"
        from copies cp
        left join marketplace_product_variants mpv on mpv.printing_id = cp.printing_id
        left join marketplace_products mp
          on mp.id = mpv.marketplace_product_id and mp.marketplace = ${marketplace}
        left join lateral (
          select coalesce(ms.market_cents, ms.low_cents) as headline_cents
          from marketplace_snapshots ms
          where ms.variant_id = mpv.id
          order by ms.recorded_at desc
          limit 1
        ) snap on true
        where cp.user_id = ${userId}
        group by cp.collection_id
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
        select
          cp.collection_id as "collectionId",
          coalesce(sum(snap.headline_cents), 0)::int as "totalValueCents",
          (count(cp.id) - count(snap.headline_cents))::int as "unpricedCopyCount"
        from copies cp
        left join marketplace_product_variants mpv on mpv.printing_id = cp.printing_id
        left join marketplace_products mp
          on mp.id = mpv.marketplace_product_id and mp.marketplace = ${marketplace}
        left join lateral (
          select coalesce(ms.market_cents, ms.low_cents) as headline_cents
          from marketplace_snapshots ms
          where ms.variant_id = mpv.id
          order by ms.recorded_at desc
          limit 1
        ) snap on true
        where cp.collection_id = ${collectionId}
        group by cp.collection_id
      `.execute(db);

      return rows.rows[0];
    },
  };
}

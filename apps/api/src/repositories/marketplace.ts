import type { Kysely, Selectable } from "kysely";
import { sql } from "kysely";

import type { Database, MarketplaceSnapshotsTable, MarketplaceProductsTable } from "../db/index.js";

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
          coalesce(sum(dc.quantity * cheapest.market_cents), 0)::int as "totalValueCents"
        from deck_cards dc
        inner join decks d on d.id = dc.deck_id and d.user_id = ${userId}
        left join lateral (
          select min(latest.market_cents) as market_cents
          from printings p
          inner join marketplace_products mp
            on mp.printing_id = p.id and mp.marketplace = ${marketplace}
          inner join lateral (
            select ms.market_cents
            from marketplace_snapshots ms
            where ms.product_id = mp.id
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
          coalesce(sum(snap.market_cents), 0)::int as "totalValueCents",
          (count(cp.id) - count(snap.market_cents))::int as "unpricedCopyCount"
        from copies cp
        left join marketplace_products mp
          on mp.printing_id = cp.printing_id and mp.marketplace = ${marketplace}
        left join lateral (
          select ms.market_cents
          from marketplace_snapshots ms
          where ms.product_id = mp.id
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
          coalesce(sum(snap.market_cents), 0)::int as "totalValueCents",
          (count(cp.id) - count(snap.market_cents))::int as "unpricedCopyCount"
        from copies cp
        left join marketplace_products mp
          on mp.printing_id = cp.printing_id and mp.marketplace = ${marketplace}
        left join lateral (
          select ms.market_cents
          from marketplace_snapshots ms
          where ms.product_id = mp.id
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

import type { Kysely } from "kysely";
import { sql } from "kysely";

import type { Database } from "../db/index.js";
import { domainsArray, imageUrl, superTypesArray } from "./query-helpers.js";

type Db = Kysely<Database>;

/**
 * Queries for the marketplace mapping workflow (mapping external products
 * to internal printings).
 *
 * @returns An object with marketplace-mapping query methods bound to the given `db`.
 */
export function marketplaceMappingRepo(db: Db) {
  return {
    /** @returns Ignored products for a marketplace. */
    ignoredProducts(marketplace: string) {
      return db
        .selectFrom("marketplaceIgnoredProducts")
        .select(["externalId", "finish", "language", "productName", "createdAt"])
        .where("marketplace", "=", marketplace)
        .execute();
    },

    /** @returns All staging rows for a marketplace, ordered by newest first. */
    allStaging(marketplace: string) {
      return db
        .selectFrom("marketplaceStaging")
        .selectAll()
        .where("marketplace", "=", marketplace)
        .orderBy("recordedAt", "desc")
        .execute();
    },

    /** @returns Group display names for a marketplace. */
    groupNames(marketplace: string) {
      return db
        .selectFrom("marketplaceGroups")
        .select(["groupId as gid", "name"])
        .where("marketplace", "=", marketplace)
        .execute();
    },

    /** @returns All cards with their printings, sets, marketplace sources, and images. */
    allCardsWithPrintings(marketplace: string) {
      return db
        .selectFrom("cards as c")
        .innerJoin("printings as p", "p.cardId", "c.id")
        .innerJoin("sets as s", "s.id", "p.setId")
        .leftJoin("marketplaceProducts as ps", (join) =>
          join.onRef("ps.printingId", "=", "p.id").on("ps.marketplace", "=", marketplace),
        )
        .leftJoin("printingImages as pi", (join) =>
          join
            .onRef("pi.printingId", "=", "p.id")
            .on("pi.face", "=", "front")
            .on("pi.isActive", "=", true),
        )
        .leftJoin("cardImages as ci", "ci.id", "pi.cardImageId")
        .leftJoin("promoTypes as pt", "pt.id", "p.promoTypeId")
        .select([
          "c.id as cardId",
          "c.slug as cardSlug",
          "c.name as cardName",
          "c.type as cardType",
          domainsArray("c.id").as("domains"),
          superTypesArray("c.id").as("superTypes"),
          "c.energy",
          "c.might",
          "p.id as printingId",
          "s.slug as setId",
          "p.shortCode",
          "p.rarity",
          "s.name as setName",
          "p.artVariant",
          "p.isSigned",
          "pt.slug as promoTypeSlug",
          "p.finish",
          "p.language",
          imageUrl("ci").as("imageUrl"),
          "ps.externalId",
          "ps.groupId as sourceGroupId",
          "ps.language as sourceLanguage",
        ])
        .orderBy("s.slug")
        .orderBy("c.name")
        .orderBy("p.shortCode")
        .orderBy("p.finish", "desc")
        .execute();
    },

    /** @returns Manual card overrides for a marketplace. */
    stagingCardOverrides(marketplace: string) {
      return db
        .selectFrom("marketplaceStagingCardOverrides")
        .select(["externalId", "finish", "language", "cardId"])
        .where("marketplace", "=", marketplace)
        .execute();
    },

    // ── saveMappings queries ────────────────────────────────────────────────

    /** @returns Printing finishes and languages by IDs. */
    printingFinishesAndLanguages(printingIds: string[]) {
      return db
        .selectFrom("printings")
        .select(["id", "finish", "language"])
        .where("id", "in", printingIds)
        .execute();
    },

    /** @returns All staging rows for given external IDs in a marketplace. */
    stagingByExternalIds(marketplace: string, externalIds: number[]) {
      return db
        .selectFrom("marketplaceStaging")
        .selectAll()
        .where("marketplace", "=", marketplace)
        .where("externalId", "in", externalIds)
        .execute();
    },

    /**
     * Batch-upsert marketplace sources.
     * @returns Inserted/updated source rows.
     */
    upsertSources(
      values: {
        marketplace: string;
        printingId: string;
        externalId: number;
        groupId: number;
        productName: string;
        language: string;
      }[],
    ) {
      return db
        .insertInto("marketplaceProducts")
        .values(values)
        .onConflict((oc) =>
          oc.columns(["marketplace", "printingId"]).doUpdateSet({
            externalId: sql<number>`excluded.external_id`,
            groupId: sql<number>`excluded.group_id`,
            productName: sql<string>`excluded.product_name`,
            language: sql<string>`excluded.language`,
          }),
        )
        .returning(["id", "printingId"])
        .execute();
    },

    /** Batch-insert snapshots with conflict resolution. */
    async insertSnapshots(
      rows: {
        productId: string;
        recordedAt: Date;
        marketCents: number;
        lowCents: number | null;
        midCents: number | null;
        highCents: number | null;
        trendCents: number | null;
        avg1Cents: number | null;
        avg7Cents: number | null;
        avg30Cents: number | null;
      }[],
    ): Promise<void> {
      await db
        .insertInto("marketplaceSnapshots")
        .values(rows)
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

    /** Delete staging rows by marketplace and (externalId, finish, language) tuples. */
    async deleteStagingTuples(
      marketplace: string,
      tuples: { externalId: number; finish: string; language: string }[],
    ): Promise<void> {
      const values = tuples.map((t) => sql`(${t.externalId}::integer, ${t.finish}, ${t.language})`);
      await sql`
        DELETE FROM marketplace_staging
        WHERE marketplace = ${marketplace}
          AND (external_id, finish, language) IN (VALUES ${sql.join(values)})
      `.execute(db);
    },

    // ── unmapPrinting queries ───────────────────────────────────────────────

    /** @returns A marketplace source by marketplace + printingId. */
    getSource(marketplace: string, printingId: string) {
      return db
        .selectFrom("marketplaceProducts")
        .selectAll()
        .where("marketplace", "=", marketplace)
        .where("printingId", "=", printingId)
        .executeTakeFirst();
    },

    /** @returns A printing's finish and language by ID. */
    getPrintingFinishAndLanguage(printingId: string) {
      return db
        .selectFrom("printings")
        .select(["finish", "language"])
        .where("id", "=", printingId)
        .executeTakeFirstOrThrow();
    },

    /** @returns All snapshots for a product ID. */
    snapshotsByProductId(productId: string) {
      return db
        .selectFrom("marketplaceSnapshots")
        .selectAll()
        .where("productId", "=", productId)
        .execute();
    },

    /** Delete all snapshots for a product ID. */
    async deleteSnapshotsByProductId(productId: string): Promise<void> {
      await db.deleteFrom("marketplaceSnapshots").where("productId", "=", productId).execute();
    },

    /** Delete a marketplace source by ID. */
    async deleteSourceById(id: string): Promise<void> {
      await db.deleteFrom("marketplaceProducts").where("id", "=", id).execute();
    },

    // ── unmapAll queries ────────────────────────────────────────────────────

    /** @returns Count of mapped sources for a marketplace. */
    async countMappedSources(marketplace: string): Promise<number> {
      const result = await db
        .selectFrom("marketplaceProducts")
        .select(sql<number>`count(*)::int`.as("count"))
        .where("marketplace", "=", marketplace)
        .where("externalId", "is not", null)
        .executeTakeFirstOrThrow();
      return result.count;
    },

    /** Delete all snapshots for mapped sources of a marketplace. */
    async deleteSnapshotsForMappedSources(marketplace: string): Promise<void> {
      await sql`
        DELETE FROM marketplace_snapshots
        WHERE product_id IN (
          SELECT id FROM marketplace_products
          WHERE marketplace = ${marketplace} AND external_id IS NOT NULL
        )
      `.execute(db);
    },

    /** Delete all mapped marketplace sources. */
    async deleteMappedSources(marketplace: string): Promise<void> {
      await db
        .deleteFrom("marketplaceProducts")
        .where("marketplace", "=", marketplace)
        .where("externalId", "is not", null)
        .execute();
    },
  };
}

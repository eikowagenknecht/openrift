import type { Kysely } from "kysely";
import { sql } from "kysely";

import type { Database } from "../db/index.js";
import { imageUrl } from "./query-helpers.js";

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
        .select(["externalId", "finish", "productName", "createdAt"])
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
        .leftJoin("marketplaceSources as ps", (join) =>
          join.onRef("ps.printingId", "=", "p.id").on("ps.marketplace", "=", marketplace),
        )
        .leftJoin("printingImages as pi", (join) =>
          join
            .onRef("pi.printingId", "=", "p.id")
            .on("pi.face", "=", "front")
            .on("pi.isActive", "=", true),
        )
        .leftJoin("promoTypes as pt", "pt.id", "p.promoTypeId")
        .select([
          "c.id as cardId",
          "c.slug as cardSlug",
          "c.name as cardName",
          "c.type as cardType",
          "c.superTypes",
          "c.domains",
          "c.energy",
          "c.might",
          "p.id as printingId",
          "s.slug as setId",
          "p.sourceId",
          "p.rarity",
          "s.name as setName",
          "p.artVariant",
          "p.isSigned",
          "pt.slug as promoTypeSlug",
          "p.finish",
          "p.collectorNumber",
          imageUrl("pi").as("imageUrl"),
          "ps.externalId",
          "ps.groupId as sourceGroupId",
        ])
        .orderBy("s.slug")
        .orderBy("c.name")
        .orderBy("p.sourceId")
        .orderBy("p.finish", "desc")
        .execute();
    },

    /** @returns Manual card overrides for a marketplace. */
    stagingCardOverrides(marketplace: string) {
      return db
        .selectFrom("marketplaceStagingCardOverrides")
        .select(["externalId", "finish", "cardId"])
        .where("marketplace", "=", marketplace)
        .execute();
    },

    // ── saveMappings queries ────────────────────────────────────────────────

    /** @returns Printing finishes by IDs. */
    printingFinishes(printingIds: string[], trx: Db) {
      return trx
        .selectFrom("printings")
        .select(["id", "finish"])
        .where("id", "in", printingIds)
        .execute();
    },

    /** @returns All staging rows for given external IDs in a marketplace. */
    stagingByExternalIds(marketplace: string, externalIds: number[], trx: Db) {
      return trx
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
      }[],
      trx: Db,
    ) {
      return trx
        .insertInto("marketplaceSources")
        .values(values)
        .onConflict((oc) =>
          oc.columns(["marketplace", "printingId"]).doUpdateSet({
            externalId: sql<number>`excluded.external_id`,
            groupId: sql<number>`excluded.group_id`,
            productName: sql<string>`excluded.product_name`,
            updatedAt: new Date(),
          }),
        )
        .returning(["id", "printingId"])
        .execute();
    },

    /** Batch-insert snapshots with conflict resolution. */
    async insertSnapshots(
      rows: {
        sourceId: string;
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
      trx: Db,
    ): Promise<void> {
      await trx
        .insertInto("marketplaceSnapshots")
        .values(rows)
        .onConflict((oc) =>
          oc.columns(["sourceId", "recordedAt"]).doUpdateSet({
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

    /** Delete staging rows by marketplace and (externalId, finish) tuples. */
    async deleteStagingTuples(
      marketplace: string,
      pairs: { externalId: number; finish: string }[],
      trx: Db,
    ): Promise<void> {
      const tuples = pairs.map((p) => sql`(${p.externalId}::integer, ${p.finish})`);
      await sql`
        DELETE FROM marketplace_staging
        WHERE marketplace = ${marketplace}
          AND (external_id, finish) IN (VALUES ${sql.join(tuples)})
      `.execute(trx);
    },

    // ── unmapPrinting queries ───────────────────────────────────────────────

    /** @returns A marketplace source by marketplace + printingId. */
    getSource(marketplace: string, printingId: string, trx: Db) {
      return trx
        .selectFrom("marketplaceSources")
        .selectAll()
        .where("marketplace", "=", marketplace)
        .where("printingId", "=", printingId)
        .executeTakeFirst();
    },

    /** @returns A printing's finish by ID. */
    getPrintingFinish(printingId: string, trx: Db) {
      return trx
        .selectFrom("printings")
        .select("finish")
        .where("id", "=", printingId)
        .executeTakeFirstOrThrow();
    },

    /** @returns All snapshots for a source ID. */
    snapshotsBySourceId(sourceId: string, trx: Db) {
      return trx
        .selectFrom("marketplaceSnapshots")
        .selectAll()
        .where("sourceId", "=", sourceId)
        .execute();
    },

    /** Delete all snapshots for a source ID. */
    async deleteSnapshotsBySourceId(sourceId: string, trx: Db): Promise<void> {
      await trx.deleteFrom("marketplaceSnapshots").where("sourceId", "=", sourceId).execute();
    },

    /** Delete a marketplace source by ID. */
    async deleteSourceById(id: string, trx: Db): Promise<void> {
      await trx.deleteFrom("marketplaceSources").where("id", "=", id).execute();
    },

    // ── unmapAll queries ────────────────────────────────────────────────────

    /** @returns Count of mapped sources for a marketplace. */
    async countMappedSources(marketplace: string, trx: Db): Promise<number> {
      const result = await trx
        .selectFrom("marketplaceSources")
        .select(sql<number>`count(*)::int`.as("count"))
        .where("marketplace", "=", marketplace)
        .where("externalId", "is not", null)
        .executeTakeFirstOrThrow();
      return result.count;
    },

    /** Delete all snapshots for mapped sources of a marketplace. */
    async deleteSnapshotsForMappedSources(marketplace: string, trx: Db): Promise<void> {
      await sql`
        DELETE FROM marketplace_snapshots
        WHERE source_id IN (
          SELECT id FROM marketplace_sources
          WHERE marketplace = ${marketplace} AND external_id IS NOT NULL
        )
      `.execute(trx);
    },

    /** Delete all mapped marketplace sources. */
    async deleteMappedSources(marketplace: string, trx: Db): Promise<void> {
      await trx
        .deleteFrom("marketplaceSources")
        .where("marketplace", "=", marketplace)
        .where("externalId", "is not", null)
        .execute();
    },
  };
}

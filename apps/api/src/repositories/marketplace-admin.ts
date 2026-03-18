import type { Kysely } from "kysely";

import type { Database } from "../db/index.js";

/**
 * Admin queries for marketplace groups, ignored products, staging overrides,
 * and price data management.
 *
 * @returns An object with marketplace admin query methods bound to the given `db`.
 */
export function marketplaceAdminRepo(db: Kysely<Database>) {
  return {
    // ── Marketplace groups ──────────────────────────────────────────────────

    /** @returns Groups for a specific marketplace, ordered by groupId or name. */
    listGroupsByMarketplace(marketplace: string, orderBy: "groupId" | "name" = "groupId") {
      return db
        .selectFrom("marketplaceGroups")
        .select(["groupId", "name", "abbreviation"])
        .where("marketplace", "=", marketplace)
        .orderBy(orderBy)
        .execute();
    },

    /** @returns All groups across all marketplaces. */
    listAllGroups() {
      return db
        .selectFrom("marketplaceGroups")
        .select(["marketplace", "groupId", "name", "abbreviation"])
        .orderBy("marketplace")
        .orderBy("name")
        .execute();
    },

    /** @returns Staging product counts per marketplace+groupId. */
    stagingCountsByMarketplaceGroup(marketplace?: string) {
      let query = db
        .selectFrom("marketplaceStaging")
        .select((eb) => [
          "marketplace" as const,
          "groupId" as const,
          eb.cast<number>(eb.fn.count("externalId").distinct(), "integer").as("count"),
        ])
        .where("groupId", "is not", null)
        .groupBy(["marketplace", "groupId"]);

      if (marketplace) {
        query = query.where("marketplace", "=", marketplace);
      }

      return query.execute();
    },

    /** @returns Assigned (mapped) product counts per marketplace+groupId. */
    assignedCountsByMarketplaceGroup(marketplace?: string) {
      let query = db
        .selectFrom("marketplaceSources")
        .select((eb) => [
          "marketplace" as const,
          "groupId" as const,
          eb.cast<number>(eb.fn.countAll(), "integer").as("count"),
        ])
        .where("groupId", "is not", null)
        .groupBy(["marketplace", "groupId"]);

      if (marketplace) {
        query = query.where("marketplace", "=", marketplace);
      }

      return query.execute();
    },

    /** Update a marketplace group's name. */
    async updateGroupName(
      marketplace: string,
      groupId: number,
      name: string | null,
    ): Promise<void> {
      await db
        .updateTable("marketplaceGroups")
        .set({ name, updatedAt: new Date() })
        .where("marketplace", "=", marketplace)
        .where("groupId", "=", groupId)
        .execute();
    },

    // ── Ignored products ────────────────────────────────────────────────────

    /** @returns All ignored products, newest first. */
    listIgnoredProducts() {
      return db
        .selectFrom("marketplaceIgnoredProducts as ip")
        .select(["ip.marketplace", "ip.externalId", "ip.finish", "ip.productName", "ip.createdAt"])
        .orderBy("ip.createdAt", "desc")
        .execute();
    },

    /** @returns Product names from staging for the given external IDs. */
    getStagingProductNames(marketplace: string, externalIds: number[]) {
      return db
        .selectFrom("marketplaceStaging")
        .select(["externalId", "productName"])
        .where("marketplace", "=", marketplace)
        .where("externalId", "in", externalIds)
        .execute();
    },

    /** Insert ignored products (skips conflicts). */
    async insertIgnoredProducts(
      values: { marketplace: string; externalId: number; finish: string; productName: string }[],
    ): Promise<void> {
      await db
        .insertInto("marketplaceIgnoredProducts")
        .values(values)
        .onConflict((oc) => oc.columns(["marketplace", "externalId", "finish"]).doNothing())
        .execute();
    },

    /** Delete a single ignored product. */
    async deleteIgnoredProduct(
      marketplace: string,
      externalId: number,
      finish: string,
    ): Promise<void> {
      await db
        .deleteFrom("marketplaceIgnoredProducts")
        .where("marketplace", "=", marketplace)
        .where("externalId", "=", externalId)
        .where("finish", "=", finish)
        .execute();
    },

    // ── Staging card overrides ──────────────────────────────────────────────

    /** Upsert a staging card override. */
    async upsertStagingCardOverride(values: {
      marketplace: string;
      externalId: number;
      finish: string;
      cardId: string;
    }): Promise<void> {
      await db
        .insertInto("marketplaceStagingCardOverrides")
        .values(values)
        .onConflict((oc) =>
          oc
            .columns(["marketplace", "externalId", "finish"])
            .doUpdateSet({ cardId: values.cardId }),
        )
        .execute();
    },

    /** Delete a staging card override. */
    async deleteStagingCardOverride(
      marketplace: string,
      externalId: number,
      finish: string,
    ): Promise<void> {
      await db
        .deleteFrom("marketplaceStagingCardOverrides")
        .where("marketplace", "=", marketplace)
        .where("externalId", "=", externalId)
        .where("finish", "=", finish)
        .execute();
    },

    // ── Clear price data ────────────────────────────────────────────────────

    /**
     * Delete all price data (snapshots, sources, staging) for a marketplace.
     * @returns Counts of deleted rows per table.
     */
    async clearPriceData(
      marketplace: string,
    ): Promise<{ snapshots: number; sources: number; staging: number }> {
      const snapshots = await db
        .deleteFrom("marketplaceSnapshots")
        .where(
          "sourceId",
          "in",
          db.selectFrom("marketplaceSources").select("id").where("marketplace", "=", marketplace),
        )
        .execute();

      const sources = await db
        .deleteFrom("marketplaceSources")
        .where("marketplace", "=", marketplace)
        .execute();

      const staging = await db
        .deleteFrom("marketplaceStaging")
        .where("marketplace", "=", marketplace)
        .execute();

      return {
        snapshots: Number(snapshots[0].numDeletedRows),
        sources: Number(sources[0].numDeletedRows),
        staging: Number(staging[0].numDeletedRows),
      };
    },
  };
}

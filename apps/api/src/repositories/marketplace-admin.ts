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
        .selectFrom("marketplaceProducts")
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

    /**
     * Update a marketplace group's name.
     * @returns `true` if a row was updated.
     */
    async updateGroupName(
      marketplace: string,
      groupId: number,
      name: string | null,
    ): Promise<boolean> {
      const result = await db
        .updateTable("marketplaceGroups")
        .set({ name })
        .where("marketplace", "=", marketplace)
        .where("groupId", "=", groupId)
        .executeTakeFirst();
      return (result?.numUpdatedRows ?? 0n) > 0n;
    },

    // ── Ignored products ────────────────────────────────────────────────────

    /** @returns All ignored products, newest first. */
    listIgnoredProducts() {
      return db
        .selectFrom("marketplaceIgnoredProducts as ip")
        .select([
          "ip.marketplace",
          "ip.externalId",
          "ip.finish",
          "ip.language",
          "ip.productName",
          "ip.createdAt",
        ])
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
      values: {
        marketplace: string;
        externalId: number;
        finish: string;
        language: string;
        productName: string;
      }[],
    ): Promise<void> {
      await db
        .insertInto("marketplaceIgnoredProducts")
        .values(values)
        .onConflict((oc) =>
          oc.columns(["marketplace", "externalId", "finish", "language"]).doNothing(),
        )
        .execute();
    },

    /**
     * Delete multiple ignored products in a single query.
     *
     * @returns Count of deleted rows.
     */
    async deleteIgnoredProducts(
      marketplace: string,
      products: { externalId: number; finish: string; language: string }[],
    ): Promise<number> {
      if (products.length === 0) {
        return 0;
      }

      const result = await db
        .deleteFrom("marketplaceIgnoredProducts")
        .where("marketplace", "=", marketplace)
        .where((eb) =>
          eb.or(
            products.map((p) =>
              eb.and([
                eb("externalId", "=", p.externalId),
                eb("finish", "=", p.finish),
                eb("language", "=", p.language),
              ]),
            ),
          ),
        )
        .execute();

      return Number(result[0].numDeletedRows);
    },

    // ── Staging card overrides ──────────────────────────────────────────────

    /** Upsert a staging card override. */
    async upsertStagingCardOverride(values: {
      marketplace: string;
      externalId: number;
      finish: string;
      language: string;
      cardId: string;
    }): Promise<void> {
      await db
        .insertInto("marketplaceStagingCardOverrides")
        .values(values)
        .onConflict((oc) =>
          oc
            .columns(["marketplace", "externalId", "finish", "language"])
            .doUpdateSet({ cardId: values.cardId }),
        )
        .execute();
    },

    /** Delete a staging card override. */
    async deleteStagingCardOverride(
      marketplace: string,
      externalId: number,
      finish: string,
      language: string,
    ): Promise<void> {
      await db
        .deleteFrom("marketplaceStagingCardOverrides")
        .where("marketplace", "=", marketplace)
        .where("externalId", "=", externalId)
        .where("finish", "=", finish)
        .where("language", "=", language)
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
          "productId",
          "in",
          db.selectFrom("marketplaceProducts").select("id").where("marketplace", "=", marketplace),
        )
        .execute();

      const sources = await db
        .deleteFrom("marketplaceProducts")
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

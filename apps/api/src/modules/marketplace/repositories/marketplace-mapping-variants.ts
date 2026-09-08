import type { Marketplace } from "@openrift/shared/types/pricing";
import type { Kysely } from "kysely";
import { sql } from "kysely";

import type { Database } from "../../../db/tables.js";
import { rowBatches } from "../../../lib/bind-batches.js";

type Db = Kysely<Database>;

export function marketplaceMappingVariantsRepo(db: Db) {
  return {
    /**
     * For each input row: upserts the per-SKU product (keyed on
     * `(marketplace, external_id, finish, language)` — NULLS NOT DISTINCT so
     * CM/TCG collapse on NULL language) then upserts the variant (keyed on
     * `(marketplace_product_id, printing_id)`). One product SKU can map to
     * multiple printings — e.g. Cardmarket's language-aggregate product row
     * legitimately covers every language of the same card.
     */
    async upsertProductVariants(
      values: {
        marketplace: Marketplace;
        printingId: string;
        externalId: number;
        groupId: number;
        productName: string;
        finish: string;
        /** `null` for marketplaces that don't expose language as a SKU axis (CM/TCG). */
        language: string | null;
      }[],
    ): Promise<
      {
        printingId: string;
        externalId: number;
        finish: string;
        language: string | null;
        variantId: string;
      }[]
    > {
      if (values.length === 0) {
        return [];
      }

      // Dedupe on the product unique key `(marketplace, external_id, finish,
      // language)`. A single batch can legitimately carry multiple variants
      // of the same product — e.g. batch-accepting a language-aggregate
      // suggestion fires one mapping per sibling printing, all pointing at
      // the same marketplace product. Without this dedupe, Postgres raises
      // "ON CONFLICT DO UPDATE command cannot affect row a second time" and
      // the whole batch fails.
      const productRowsByKey = new Map<
        string,
        {
          marketplace: Marketplace;
          externalId: number;
          groupId: number;
          productName: string;
          finish: string;
          language: string | null;
        }
      >();
      for (const v of values) {
        const key = `${v.marketplace}::${v.externalId}::${v.finish}::${v.language ?? ""}`;
        if (!productRowsByKey.has(key)) {
          productRowsByKey.set(key, {
            marketplace: v.marketplace,
            externalId: v.externalId,
            groupId: v.groupId,
            productName: v.productName,
            finish: v.finish,
            language: v.language,
          });
        }
      }
      const productRows = [...productRowsByKey.values()];

      // `doNothing` would leave conflicting rows out of RETURNING, with no id to
      // bind. The `marketplace_products_sku_key` unique is NULLS NOT DISTINCT.
      // Batched: the admin body this runs on can exceed one statement's bind limit.
      const products = [];
      for (const batch of rowBatches(productRows)) {
        products.push(
          ...(await db
            .insertInto("marketplaceProducts")
            .values(batch)
            .onConflict((oc) =>
              oc.columns(["marketplace", "externalId", "finish", "language"]).doUpdateSet({
                groupId: (eb) => eb.ref("excluded.groupId"),
                productName: (eb) => eb.ref("excluded.productName"),
              }),
            )
            .returning(["id", "marketplace", "externalId", "finish", "language"])
            .execute()),
        );
      }

      const productIdByKey = new Map(
        products.map((p) => [
          `${p.marketplace}::${p.externalId}::${p.finish}::${p.language ?? ""}`,
          p.id,
        ]),
      );

      const variantRows = values.map((v) => {
        const productId = productIdByKey.get(
          `${v.marketplace}::${v.externalId}::${v.finish}::${v.language ?? ""}`,
        );
        if (!productId) {
          throw new Error(
            `upsertProductVariants: missing product id for ${v.marketplace} ${v.externalId} ${v.finish}/${v.language ?? "NULL"}`,
          );
        }
        return {
          marketplaceProductId: productId,
          printingId: v.printingId,
        };
      });

      const variants = [];
      for (const batch of rowBatches(variantRows)) {
        variants.push(
          ...(await db
            .insertInto("marketplaceProductVariants")
            .values(batch)
            .onConflict((oc) =>
              oc.columns(["marketplaceProductId", "printingId"]).doUpdateSet({
                // Touch a no-op so RETURNING yields the row on both insert and conflict.
                updatedAt: sql<Date>`now()`,
              }),
            )
            .returning(["id", "marketplaceProductId", "printingId"])
            .execute()),
        );
      }

      const productKeyByProductId = new Map(products.map((p) => [p.id, p]));

      return variants.map((v) => {
        const p = productKeyByProductId.get(v.marketplaceProductId);
        if (!p) {
          throw new Error(
            `upsertProductVariants: missing product for variant ${v.id} (product ${v.marketplaceProductId})`,
          );
        }
        return {
          printingId: v.printingId,
          externalId: p.externalId,
          finish: p.finish,
          language: p.language,
          variantId: v.id,
        };
      });
    },

    /**
     * Filtered by the full SKU tuple `(externalId, finish, language)` because
     * CardTrader fans one blueprint id out across multiple `(finish,
     * language)` rows in `marketplace_products`, and admins routinely bind
     * several of those rows to the same printing. Without finish/language the
     * lookup is ambiguous and `executeTakeFirst()` would silently delete the
     * wrong variant.
     */
    getVariantForPrinting(
      marketplace: Marketplace,
      printingId: string,
      externalId: number,
      finish: string,
      language: string | null,
    ) {
      let query = db
        .selectFrom("marketplaceProductVariants as mpv")
        .innerJoin("marketplaceProducts as mp", "mp.id", "mpv.marketplaceProductId")
        .select([
          "mpv.id as variantId",
          "mpv.marketplaceProductId as marketplaceProductId",
          "mp.finish as finish",
          "mp.language as language",
          "mp.externalId as externalId",
          "mp.groupId as groupId",
          "mp.productName as productName",
          "mp.marketplace as marketplace",
        ])
        .where("mp.marketplace", "=", marketplace)
        .where("mpv.printingId", "=", printingId)
        .where("mp.externalId", "=", externalId)
        .where("mp.finish", "=", finish);
      query =
        language === null
          ? query.where("mp.language", "is", null)
          : query.where("mp.language", "=", language);
      return query.executeTakeFirst();
    },

    getPrintingFinishAndLanguage(printingId: string) {
      return db
        .selectFrom("printings")
        .select(["finish", "language"])
        .where("id", "=", printingId)
        .executeTakeFirstOrThrow();
    },

    /**
     * The parent product row + its price history are left in place on purpose
     * — they represent a known upstream SKU and survive unmap, so a later
     * rebind inherits full history without the product being recreated.
     */
    async deleteVariantById(id: string): Promise<void> {
      await db.deleteFrom("marketplaceProductVariants").where("id", "=", id).execute();
    },

    /**
     * Each printing sees exactly the variants whose `printing_id` equals its
     * own — language-aggregate fan-out is materialised as explicit variant
     * rows, so there is no sibling self-join. `ownerLanguage` equals the
     * printing's own language; callers treat every row as "owned."
     */
    variantsForCard(cardId: string): Promise<
      {
        targetPrintingId: string;
        marketplace: Marketplace;
        externalId: number;
        productName: string;
        finish: string;
        variantLanguage: string | null;
        ownerPrintingId: string;
        ownerLanguage: string;
      }[]
    > {
      return db
        .selectFrom("printings as p")
        .innerJoin("marketplaceProductVariants as mpv", "mpv.printingId", "p.id")
        .innerJoin("marketplaceProducts as mp", "mp.id", "mpv.marketplaceProductId")
        .select([
          "p.id as targetPrintingId",
          "mp.marketplace as marketplace",
          "mp.externalId as externalId",
          "mp.productName as productName",
          "mp.finish as finish",
          "mp.language as variantLanguage",
          "p.id as ownerPrintingId",
          "p.language as ownerLanguage",
        ])
        .where("p.cardId", "=", cardId)
        .execute();
    },
  };
}

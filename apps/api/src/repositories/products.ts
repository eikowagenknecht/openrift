import { WellKnown } from "@openrift/shared";
import { PRODUCT_COVER_CARD_COUNT } from "@openrift/shared/contracts/products";
import type { Kysely, Selectable } from "kysely";
import { sql } from "kysely";

import type { Database, ProductsTable } from "../db/index.js";
import { imageId, requireFrontImage } from "./query-helpers.js";

export interface ProductWithCounts extends Selectable<ProductsTable> {
  printingCount: number;
  cardTotal: number;
  setSlug: string | null;
  setName: string | null;
}

export interface ProductContentRow {
  printingId: string;
  quantity: number;
}

export interface ProductCoverRow {
  productId: string;
  printingId: string;
  imageId: string;
  name: string;
}

export interface ProductForPrintingRow {
  printingId: string;
  slug: string;
  name: string;
  quantity: number;
}

export function productsRepo(db: Kysely<Database>) {
  const withCounts = () =>
    db
      .selectFrom("products as p")
      .leftJoin("productPrintings as pp", "pp.productId", "p.id")
      .leftJoin("sets as s", "s.id", "p.setId")
      .selectAll("p")
      .select([
        "s.slug as setSlug",
        "s.name as setName",
        sql<number>`count(pp.printing_id)::int`.as("printingCount"),
        sql<number>`coalesce(sum(pp.quantity), 0)::int`.as("cardTotal"),
      ])
      .groupBy(["p.id", "s.slug", "s.name", "s.sortOrder"]);

  return {
    /** The /products index groups consecutive rows by set: must stay set order (no-set last), then name. */
    listWithCounts(): Promise<ProductWithCounts[]> {
      return withCounts()
        .orderBy(sql`s.sort_order nulls last`)
        .orderBy("p.name")
        .execute();
    },

    getBySlugWithCounts(slug: string): Promise<ProductWithCounts | undefined> {
      return withCounts().where("p.slug", "=", slug).executeTakeFirst();
    },

    async allSitemapEntries(): Promise<{ slug: string; updatedAt: string }[]> {
      const rows = await db.selectFrom("products").select(["slug", "updatedAt"]).execute();
      return rows.map((row) => ({ slug: row.slug, updatedAt: row.updatedAt.toISOString() }));
    },

    getByIdWithCounts(id: string): Promise<ProductWithCounts | undefined> {
      return withCounts().where("p.id", "=", id).executeTakeFirst();
    },

    getById(id: string): Promise<Selectable<ProductsTable> | undefined> {
      return db.selectFrom("products").selectAll().where("id", "=", id).executeTakeFirst();
    },

    async slugTaken(slug: string, excludeId?: string): Promise<boolean> {
      let query = db.selectFrom("products").select("id").where("slug", "=", slug);
      if (excludeId !== undefined) {
        query = query.where("id", "!=", excludeId);
      }
      return (await query.executeTakeFirst()) !== undefined;
    },

    create(values: {
      slug: string;
      name: string;
      description: string | null;
      setId: string | null;
    }): Promise<Selectable<ProductsTable>> {
      return db.insertInto("products").values(values).returningAll().executeTakeFirstOrThrow();
    },

    async update(
      id: string,
      patch: Partial<{
        slug: string;
        name: string;
        description: string | null;
        setId: string | null;
      }>,
    ): Promise<void> {
      await db.updateTable("products").set(patch).where("id", "=", id).execute();
    },

    async touch(id: string): Promise<void> {
      await db
        .updateTable("products")
        .set({ updatedAt: new Date() })
        .where("id", "=", id)
        .execute();
    },

    /** Row deletion cascades to the product's contents. */
    async remove(id: string): Promise<boolean> {
      const result = await db.deleteFrom("products").where("id", "=", id).executeTakeFirst();
      return result.numDeletedRows > 0n;
    },

    /** Battlefields are excluded: their landscape art breaks the portrait card fan. */
    async coverCards(productIds: string[]): Promise<ProductCoverRow[]> {
      if (productIds.length === 0) {
        return [];
      }
      // One row per (product, card): the best printing per card, so
      // variant-heavy cards can't fill the whole fan with the same art.
      const bestPerCard = requireFrontImage(
        db
          .selectFrom("productPrintings as pp")
          .innerJoin("printings as pr", "pr.id", "pp.printingId")
          .innerJoin("cards as c", "c.id", "pr.cardId"),
        "pp.printingId",
      )
        .leftJoin("cardTypes as ct", "ct.slug", "c.type")
        .leftJoin("rarities as r", "r.slug", "pr.rarity")
        .select([
          "pp.productId",
          "pp.printingId",
          imageId("imgf").as("imageId"),
          "c.name",
          sql<number>`coalesce(ct.sort_order, 32767)`.as("typeOrder"),
          sql<number>`coalesce(r.sort_order, -1)`.as("rarityOrder"),
          "pr.publicCode",
          sql<number>`(row_number() over (
            partition by pp.product_id, pr.card_id
            order by coalesce(r.sort_order, -1) desc, pr.public_code
          ))::int`.as("printingRank"),
        ])
        .where("pp.productId", "in", productIds)
        .where(sql`${imageId("imgf")}`, "is not", null)
        .where("c.type", "!=", WellKnown.cardType.BATTLEFIELD);

      const rankedPerProduct = db
        .selectFrom(bestPerCard.as("best"))
        .select([
          "best.productId",
          "best.printingId",
          "best.imageId",
          "best.name",
          sql<number>`(row_number() over (
            partition by best.product_id
            order by best.type_order, best.rarity_order desc, best.public_code
          ))::int`.as("coverRank"),
        ])
        .where("best.printingRank", "=", 1);

      const rows = await db
        .selectFrom(rankedPerProduct.as("ranked"))
        .select(["ranked.productId", "ranked.printingId", "ranked.imageId", "ranked.name"])
        .where("ranked.coverRank", "<=", PRODUCT_COVER_CARD_COUNT)
        .orderBy("ranked.productId")
        .orderBy("ranked.coverRank")
        .execute();
      // imageId() is nullable in the row type but the IS NOT NULL filter
      // guarantees it here.
      return rows as ProductCoverRow[];
    },

    /** Unordered: display order is a client concern. */
    contents(productId: string): Promise<ProductContentRow[]> {
      return db
        .selectFrom("productPrintings")
        .select(["printingId", "quantity"])
        .where("productId", "=", productId)
        .execute();
    },

    /** Rides the `idx_product_printings_printing` index. */
    productsForCard(cardId: string): Promise<ProductForPrintingRow[]> {
      return db
        .selectFrom("productPrintings as pp")
        .innerJoin("printings as pr", "pr.id", "pp.printingId")
        .innerJoin("products as p", "p.id", "pp.productId")
        .select(["pp.printingId", "p.slug", "p.name", "pp.quantity"])
        .where("pr.cardId", "=", cardId)
        .orderBy("p.name")
        .execute();
    },

    /** Call inside `transact` together with any metadata write. */
    async replaceContents(productId: string, rows: ProductContentRow[]): Promise<void> {
      await db.deleteFrom("productPrintings").where("productId", "=", productId).execute();
      if (rows.length > 0) {
        await db
          .insertInto("productPrintings")
          .values(rows.map((row) => ({ productId, ...row })))
          .execute();
      }
    },
  };
}

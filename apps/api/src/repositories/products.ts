import type { Kysely, Selectable } from "kysely";
import { sql } from "kysely";

import type { Database, ProductsTable } from "../db/index.js";

/** A product row with its content rollups (distinct printings, summed quantities). */
export interface ProductWithCounts extends Selectable<ProductsTable> {
  printingCount: number;
  cardTotal: number;
}

/** One content row of a product snapshot. */
export interface ProductContentRow {
  printingId: string;
  quantity: number;
}

/** A product back-reference for one printing of a card. */
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
      .selectAll("p")
      .select([
        sql<number>`count(pp.printing_id)::int`.as("printingCount"),
        sql<number>`coalesce(sum(pp.quantity), 0)::int`.as("cardTotal"),
      ])
      .groupBy("p.id");

  return {
    /** @returns All products with content counts, ordered by name. */
    listWithCounts(): Promise<ProductWithCounts[]> {
      return withCounts().orderBy("p.name").execute();
    },

    /** @returns The product with content counts, or undefined. */
    getBySlugWithCounts(slug: string): Promise<ProductWithCounts | undefined> {
      return withCounts().where("p.slug", "=", slug).executeTakeFirst();
    },

    /** @returns The product with content counts, or undefined. */
    getByIdWithCounts(id: string): Promise<ProductWithCounts | undefined> {
      return withCounts().where("p.id", "=", id).executeTakeFirst();
    },

    /** @returns The bare product row, or undefined. */
    getById(id: string): Promise<Selectable<ProductsTable> | undefined> {
      return db.selectFrom("products").selectAll().where("id", "=", id).executeTakeFirst();
    },

    /** @returns Whether another product already uses this slug. */
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
    }): Promise<Selectable<ProductsTable>> {
      return db.insertInto("products").values(values).returningAll().executeTakeFirstOrThrow();
    },

    async update(
      id: string,
      patch: Partial<{ slug: string; name: string; description: string | null }>,
    ): Promise<void> {
      await db.updateTable("products").set(patch).where("id", "=", id).execute();
    },

    /** Bumps `updated_at` so a contents re-sync surfaces in "recently updated". */
    async touch(id: string): Promise<void> {
      await db
        .updateTable("products")
        .set({ updatedAt: new Date() })
        .where("id", "=", id)
        .execute();
    },

    /** @returns Whether a row was deleted (contents cascade). */
    async remove(id: string): Promise<boolean> {
      const result = await db.deleteFrom("products").where("id", "=", id).executeTakeFirst();
      return result.numDeletedRows > 0n;
    },

    /** @returns The product's content rows (unordered; display order is a client concern). */
    contents(productId: string): Promise<ProductContentRow[]> {
      return db
        .selectFrom("productPrintings")
        .select(["printingId", "quantity"])
        .where("productId", "=", productId)
        .execute();
    },

    /**
     * Reverse lookup for the card-detail page: every product containing any
     * printing of this card, one row per (printing, product). Rides the
     * `idx_product_printings_printing` index.
     *
     * @returns Back-reference rows, ordered by product name.
     */
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

    /**
     * Wholesale-replaces the product's contents (ADR-015: snapshots are not
     * diffs). Call inside `transact` together with any metadata write.
     */
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

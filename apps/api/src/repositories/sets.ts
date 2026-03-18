import type { Kysely, Selectable, Transaction } from "kysely";

import type { Database, SetsTable } from "../db/index.js";

type Trx = Transaction<Database> | Kysely<Database>;

/**
 * Queries for game sets (the `sets` table).
 *
 * @returns An object with set query methods bound to the given `db`.
 */
export function setsRepo(db: Kysely<Database>) {
  return {
    /** @returns Whether the database connection is alive. */
    async ping(): Promise<boolean> {
      try {
        await db.selectNoFrom((eb) => eb.lit(1).as("one")).execute();
        return true;
      } catch {
        return false;
      }
    },

    /** @returns Whether at least one set exists (used for health checks). */
    async hasAny(): Promise<boolean> {
      const row = await db.selectFrom("sets").select("id").limit(1).executeTakeFirst();
      return row !== undefined;
    },

    /** @returns All sets ordered by sort order. */
    listAll(): Promise<Selectable<SetsTable>[]> {
      return db.selectFrom("sets").selectAll().orderBy("sortOrder").execute();
    },

    /** @returns A set's UUID by slug, or undefined. */
    getBySlug(slug: string): Promise<Pick<Selectable<SetsTable>, "id"> | undefined> {
      return db.selectFrom("sets").select("id").where("slug", "=", slug).executeTakeFirst();
    },

    /** @returns The next sort order (max + 1). */
    async nextSortOrder(): Promise<number> {
      const { max } = await db
        .selectFrom("sets")
        .select((eb) => eb.fn.coalesce(eb.fn.max("sortOrder"), eb.lit(0)).as("max"))
        .executeTakeFirstOrThrow();
      return max + 1;
    },

    /** Creates a new set with the given values. */
    async create(values: {
      slug: string;
      name: string;
      printedTotal: number | null;
      releasedAt?: string | null;
      sortOrder: number;
    }): Promise<void> {
      await db
        .insertInto("sets")
        .values({
          slug: values.slug,
          name: values.name,
          printedTotal: values.printedTotal,
          releasedAt: values.releasedAt ?? null,
          sortOrder: values.sortOrder,
        })
        .execute();
    },

    /** Updates a set by slug. */
    async update(
      slug: string,
      values: { name: string; printedTotal: number | null; releasedAt: string | null },
    ): Promise<void> {
      await db
        .updateTable("sets")
        .set({ ...values, updatedAt: new Date() })
        .where("slug", "=", slug)
        .execute();
    },

    /** Deletes a set by slug. */
    async deleteBySlug(slug: string): Promise<void> {
      await db.deleteFrom("sets").where("slug", "=", slug).execute();
    },

    /** @returns The count of printings in a set (by set UUID). */
    async printingCount(setId: string): Promise<number> {
      const { count } = await db
        .selectFrom("printings")
        .select((eb) => eb.cast<number>(eb.fn.countAll(), "integer").as("count"))
        .where("setId", "=", setId)
        .executeTakeFirstOrThrow();
      return count;
    },

    /** @returns Distinct card count per set (keyed by setId). */
    cardCountsBySet(): Promise<{ setId: string; cardCount: number }[]> {
      return db
        .selectFrom("printings")
        .select((eb) => [
          "setId" as const,
          eb.cast<number>(eb.fn.count("cardId").distinct(), "integer").as("cardCount"),
        ])
        .groupBy("setId")
        .execute();
    },

    /** @returns Total printing count per set (keyed by setId). */
    printingCountsBySet(): Promise<{ setId: string; printingCount: number }[]> {
      return db
        .selectFrom("printings")
        .select((eb) => [
          "setId" as const,
          eb.cast<number>(eb.fn.countAll(), "integer").as("printingCount"),
        ])
        .groupBy("setId")
        .execute();
    },

    /** Reorders sets by slug list. Each slug gets sortOrder = index + 1. */
    async reorder(slugs: string[]): Promise<void> {
      await db.transaction().execute(async (tx) => {
        for (let i = 0; i < slugs.length; i++) {
          await tx
            .updateTable("sets")
            .set({ sortOrder: i + 1, updatedAt: new Date() })
            .where("slug", "=", slugs[i])
            .execute();
        }
      });
    },

    /**
     * Upsert a set by slug, inserting it with the next sort_order if it doesn't exist.
     * Used during card source ingestion.
     */
    async upsert(slug: string, name: string, trx: Trx): Promise<void> {
      const existing = await trx
        .selectFrom("sets")
        .select("id")
        .where("slug", "=", slug)
        .executeTakeFirst();

      if (!existing) {
        const { max } = await trx
          .selectFrom("sets")
          .select((eb) => eb.fn.coalesce(eb.fn.max("sortOrder"), eb.lit(0)).as("max"))
          .executeTakeFirstOrThrow();
        await trx
          .insertInto("sets")
          .values({ slug, name, printedTotal: 0, sortOrder: max + 1 })
          .execute();
      }
    },
  };
}

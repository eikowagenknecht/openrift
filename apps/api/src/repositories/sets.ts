import type { Kysely, Selectable } from "kysely";
import { sql } from "kysely";

import type { Database, SetsTable } from "../db/index.js";

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

    /** @returns A set's UUID and printing count by slug, or undefined. */
    getBySlugWithPrintingCount(
      slug: string,
    ): Promise<{ id: string; printingCount: number } | undefined> {
      return db
        .selectFrom("sets")
        .leftJoin("printings", "printings.setId", "sets.id")
        .select((eb) => [
          "sets.id",
          eb.cast<number>(eb.fn.countAll("printings"), "integer").as("printingCount"),
        ])
        .where("sets.slug", "=", slug)
        .groupBy("sets.id")
        .executeTakeFirst();
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

    /**
     * Atomically inserts a set if its slug doesn't already exist.
     * Computes sortOrder inline (max + 1) to avoid race conditions.
     * @returns `true` if a row was inserted, `false` if the slug already existed.
     */
    async createIfNotExists(values: {
      slug: string;
      name: string;
      printedTotal: number | null;
      releasedAt?: string | null;
    }): Promise<string | null> {
      const result = await db
        .insertInto("sets")
        .values({
          slug: values.slug,
          name: values.name,
          printedTotal: values.printedTotal,
          releasedAt: values.releasedAt ?? null,
          sortOrder: sql<number>`coalesce((select max(sort_order) from sets), 0) + 1`,
        })
        .onConflict((oc) => oc.column("slug").doNothing())
        .returning("id")
        .executeTakeFirst();

      return result?.id ?? null;
    },

    /**
     * Updates a set by slug.
     * @returns `true` if a row was updated.
     */
    async update(
      id: string,
      values: { name: string; printedTotal: number | null; releasedAt: string | null },
    ): Promise<boolean> {
      const result = await db
        .updateTable("sets")
        .set(values)
        .where("id", "=", id)
        .executeTakeFirst();
      return (result?.numUpdatedRows ?? 0n) > 0n;
    },

    /** Deletes a set by UUID. */
    async deleteById(id: string): Promise<void> {
      await db.deleteFrom("sets").where("id", "=", id).execute();
    },

    /** @returns The count of distinct cards in a set (by set UUID). */
    async cardCount(setId: string): Promise<number> {
      const { count } = await db
        .selectFrom("printings")
        .select((eb) => eb.cast<number>(eb.fn.count("cardId").distinct(), "integer").as("count"))
        .where("setId", "=", setId)
        .executeTakeFirstOrThrow();
      return count;
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
    async reorder(ids: string[]): Promise<void> {
      if (ids.length === 0) {
        return;
      }
      const values = sql.join(ids.map((id, i) => sql`(${id}::uuid, ${i + 1}::int)`));
      await sql`
        update sets
        set sort_order = d.new_order
        from (values ${values}) as d(id, new_order)
        where sets.id = d.id
      `.execute(db);
    },

    /**
     * Upsert a set by slug, inserting it with the next sort_order if it doesn't exist.
     * Used during card source ingestion.
     */
    async upsert(slug: string, name: string): Promise<void> {
      const existing = await db
        .selectFrom("sets")
        .select("id")
        .where("slug", "=", slug)
        .executeTakeFirst();

      if (!existing) {
        const { max } = await db
          .selectFrom("sets")
          .select((eb) => eb.fn.coalesce(eb.fn.max("sortOrder"), eb.lit(0)).as("max"))
          .executeTakeFirstOrThrow();
        await db
          .insertInto("sets")
          .values({ slug, name, printedTotal: 0, sortOrder: max + 1 })
          .execute();
      }
    },
  };
}

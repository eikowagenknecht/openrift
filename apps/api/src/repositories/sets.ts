import type { SetReleases } from "@openrift/shared/set-release";
import type { Kysely, Selectable } from "kysely";
import { sql } from "kysely";

import type { Database, SetsTable } from "../db/index.js";
import { reorderBySortOrder } from "./sort-order.js";

export function setsRepo(db: Kysely<Database>) {
  return {
    listAll(): Promise<Selectable<SetsTable>[]> {
      return db.selectFrom("sets").selectAll().orderBy("sortOrder").execute();
    },

    getBySlug(slug: string): Promise<Pick<Selectable<SetsTable>, "id"> | undefined> {
      return db.selectFrom("sets").select("id").where("slug", "=", slug).executeTakeFirst();
    },

    getRef(id: string): Promise<{ slug: string; name: string } | undefined> {
      return db.selectFrom("sets").select(["slug", "name"]).where("id", "=", id).executeTakeFirst();
    },

    getPrintedTotal(id: string): Promise<{ printedTotal: number | null } | undefined> {
      return db.selectFrom("sets").select("printedTotal").where("id", "=", id).executeTakeFirst();
    },

    async getNamesByIds(ids: string[]): Promise<Map<string, string>> {
      if (ids.length === 0) {
        return new Map();
      }
      const rows = await db
        .selectFrom("sets")
        .select(["id", "name"])
        .where("id", "in", ids)
        .execute();
      return new Map(rows.map((row) => [row.id, row.name]));
    },

    async create(values: {
      slug: string;
      name: string;
      printedTotal: number | null;
      sortOrder: number;
    }): Promise<void> {
      await db
        .insertInto("sets")
        .values({
          slug: values.slug,
          name: values.name,
          printedTotal: values.printedTotal,
          sortOrder: values.sortOrder,
        })
        .execute();
    },

    /**
     * Atomically inserts a set if its slug doesn't already exist.
     * Computes sortOrder inline (max + 1) to avoid a check-then-insert race.
     */
    async createIfNotExists(values: {
      slug: string;
      name: string;
      printedTotal: number | null;
      setType: "main" | "supplemental";
    }): Promise<string | null> {
      const result = await db
        .insertInto("sets")
        .values({
          slug: values.slug,
          name: values.name,
          printedTotal: values.printedTotal,
          setType: values.setType,
          sortOrder: sql<number>`coalesce((select max(sort_order) from sets), 0) + 1`,
        })
        .onConflict((oc) => oc.column("slug").doNothing())
        .returning("id")
        .executeTakeFirst();

      return result?.id ?? null;
    },

    async update(
      id: string,
      values: {
        name: string;
        printedTotal: number | null;
        setType: "main" | "supplemental";
      },
    ): Promise<boolean> {
      const result = await db
        .updateTable("sets")
        .set(values)
        .where("id", "=", id)
        .executeTakeFirst();
      return (result?.numUpdatedRows ?? 0n) > 0n;
    },

    async releasesBySet(): Promise<Map<string, SetReleases>> {
      const rows = await db
        .selectFrom("setReleases")
        .select(["setId", "language", "releasedAt", "precision"])
        .execute();
      const bySet = new Map<string, SetReleases>();
      for (const row of rows) {
        const releases = bySet.get(row.setId) ?? {};
        releases[row.language] = { releasedAt: row.releasedAt, precision: row.precision };
        bySet.set(row.setId, releases);
      }
      return bySet;
    },

    async replaceReleases(setId: string, releases: SetReleases): Promise<void> {
      const languages = Object.keys(releases);
      await db.transaction().execute(async (trx) => {
        let deletion = trx.deleteFrom("setReleases").where("setId", "=", setId);
        if (languages.length > 0) {
          deletion = deletion.where("language", "not in", languages);
        }
        await deletion.execute();

        if (languages.length === 0) {
          return;
        }
        await trx
          .insertInto("setReleases")
          .values(
            languages.map((language) => ({
              setId,
              language,
              releasedAt: releases[language]?.releasedAt ?? null,
              precision: releases[language]?.precision ?? null,
            })),
          )
          .onConflict((oc) =>
            oc.columns(["setId", "language"]).doUpdateSet((eb) => ({
              releasedAt: eb.ref("excluded.releasedAt"),
              precision: eb.ref("excluded.precision"),
            })),
          )
          .execute();
      });
    },

    async deleteById(id: string): Promise<void> {
      await db.deleteFrom("sets").where("id", "=", id).execute();
    },

    async cardCount(setId: string): Promise<number> {
      const { count } = await db
        .selectFrom("printings")
        .select((eb) => eb.cast<number>(eb.fn.count("cardId").distinct(), "integer").as("count"))
        .where("setId", "=", setId)
        .executeTakeFirstOrThrow();
      return count;
    },

    async printingCount(setId: string): Promise<number> {
      const { count } = await db
        .selectFrom("printings")
        .select((eb) => eb.cast<number>(eb.fn.countAll(), "integer").as("count"))
        .where("setId", "=", setId)
        .executeTakeFirstOrThrow();
      return count;
    },

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

    reorder(ids: readonly string[]): Promise<void> {
      return reorderBySortOrder(db, {
        table: "sets",
        keyColumn: "id",
        keys: ids,
        keyType: "uuid",
      });
    },

    /**
     * `sort_order` has no unique constraint: two ingests naming different new
     * sets can tie on `max(sort_order)`, which the admin reorder fixes.
     */
    async upsert(slug: string, name: string): Promise<void> {
      await db
        .insertInto("sets")
        .values({
          slug,
          name,
          printedTotal: 0,
          sortOrder: sql<number>`coalesce((select max(sort_order) from sets), 0) + 1`,
        })
        .onConflict((oc) => oc.column("slug").doNothing())
        .execute();
    },
  };
}

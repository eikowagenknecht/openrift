import type { Kysely } from "kysely";
import { sql } from "kysely";

import type { Database } from "../db/index.js";

function selectWithCategory(db: Kysely<Database>) {
  return db
    .selectFrom("customTags as ct")
    .innerJoin("customTagCategories as cc", "cc.id", "ct.categoryId")
    .select([
      "ct.id",
      "ct.slug",
      "ct.label",
      "ct.categoryId",
      "cc.slug as category",
      "cc.label as categoryLabel",
      "cc.sortOrder as categorySortOrder",
      "ct.description",
      "ct.sortOrder",
      "ct.createdAt",
      "ct.updatedAt",
    ]);
}

export function customTagsRepo(db: Kysely<Database>) {
  return {
    listAll() {
      return selectWithCategory(db)
        .orderBy("cc.sortOrder")
        .orderBy("cc.label")
        .orderBy("ct.sortOrder")
        .orderBy("ct.label")
        .execute();
    },

    getById(id: string) {
      return selectWithCategory(db).where("ct.id", "=", id).executeTakeFirst();
    },

    getBySlug(slug: string) {
      return selectWithCategory(db).where("ct.slug", "=", slug).executeTakeFirst();
    },

    listBySlugs(slugs: readonly string[]) {
      if (slugs.length === 0) {
        return Promise.resolve([]);
      }
      return selectWithCategory(db).where("ct.slug", "in", slugs).execute();
    },

    async getMaxSortOrder(categoryId: string): Promise<number> {
      const row = await db
        .selectFrom("customTags")
        .select((eb) => eb.fn.max("sortOrder").as("maxSortOrder"))
        .where("categoryId", "=", categoryId)
        .executeTakeFirst();
      return row?.maxSortOrder ?? -1;
    },

    async create(values: {
      slug: string;
      label: string;
      categoryId: string;
      description?: string | null;
      sortOrder?: number;
    }) {
      const inserted = await db
        .insertInto("customTags")
        .values({
          slug: values.slug,
          label: values.label,
          categoryId: values.categoryId,
          description: values.description ?? null,
          ...(values.sortOrder === undefined ? {} : { sortOrder: values.sortOrder }),
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      const row = await selectWithCategory(db).where("ct.id", "=", inserted.id).executeTakeFirst();
      if (!row) {
        throw new Error(`Custom tag ${inserted.id} disappeared between insert and read`);
      }
      return row;
    },

    async update(
      id: string,
      updates: {
        slug?: string;
        label?: string;
        categoryId?: string;
        description?: string | null;
      },
    ): Promise<void> {
      // UPDATE without RETURNING always produces one UpdateResult, so
      // executeTakeFirstOrThrow wouldn't catch "row not found".
      await db.updateTable("customTags").set(updates).where("id", "=", id).execute();
    },

    async deleteById(id: string): Promise<void> {
      // DELETE without RETURNING never throws on an empty match.
      await db.deleteFrom("customTags").where("id", "=", id).execute();
    },

    async assignmentsByCard(): Promise<Map<string, string[]>> {
      const rows = await db
        .selectFrom("cardCustomTags as cct")
        .innerJoin("customTags as ct", "ct.id", "cct.customTagId")
        .select(["cct.cardId", "ct.slug"])
        .orderBy("ct.slug")
        .execute();
      const out = new Map<string, string[]>();
      for (const row of rows) {
        const existing = out.get(row.cardId);
        if (existing) {
          existing.push(row.slug);
        } else {
          out.set(row.cardId, [row.slug]);
        }
      }
      return out;
    },

    async assignmentsForCardIds(cardIds: readonly string[]): Promise<Map<string, string[]>> {
      if (cardIds.length === 0) {
        return new Map();
      }
      const rows = await db
        .selectFrom("cardCustomTags as cct")
        .innerJoin("customTags as ct", "ct.id", "cct.customTagId")
        .select(["cct.cardId", "ct.slug"])
        .where("cct.cardId", "in", cardIds)
        .orderBy("ct.slug")
        .execute();
      const out = new Map<string, string[]>();
      for (const row of rows) {
        const existing = out.get(row.cardId);
        if (existing) {
          existing.push(row.slug);
        } else {
          out.set(row.cardId, [row.slug]);
        }
      }
      return out;
    },

    async tagIdsForCard(cardId: string): Promise<string[]> {
      const rows = await db
        .selectFrom("cardCustomTags")
        .select("customTagId")
        .where("cardId", "=", cardId)
        .execute();
      return rows.map((r) => r.customTagId);
    },

    async setForCard(cardId: string, customTagIds: readonly string[]): Promise<void> {
      const run = async (trx: Kysely<Database>): Promise<void> => {
        await trx.deleteFrom("cardCustomTags").where("cardId", "=", cardId).execute();
        if (customTagIds.length === 0) {
          return;
        }
        await trx
          .insertInto("cardCustomTags")
          .values(customTagIds.map((customTagId) => ({ cardId, customTagId })))
          .execute();
      };
      await (db.isTransaction ? run(db) : db.transaction().execute(run));
    },

    async addToCards(customTagId: string, cardIds: readonly string[]): Promise<number> {
      if (cardIds.length === 0) {
        return 0;
      }
      const inserted = await db
        .insertInto("cardCustomTags")
        .values(cardIds.map((cardId) => ({ cardId, customTagId })))
        .onConflict((oc) => oc.columns(["cardId", "customTagId"]).doNothing())
        .returning("cardId")
        .execute();
      return inserted.length;
    },

    async clearAssignments(customTagId: string): Promise<number> {
      const result = await db
        .deleteFrom("cardCustomTags")
        .where("customTagId", "=", customTagId)
        .executeTakeFirst();
      return Number(result.numDeletedRows);
    },

    async isInUse(id: string): Promise<boolean> {
      const row = await db
        .selectFrom("cardCustomTags")
        .select(sql<number>`1`.as("one"))
        .where("customTagId", "=", id)
        .limit(1)
        .executeTakeFirst();
      return row !== undefined;
    },
  };
}

import type { Kysely } from "kysely";
import { sql } from "kysely";

import type { Database } from "../db/index.js";

/**
 * Shared SELECT projection: joins the categories table so callers see the
 * category slug + label alongside each tag without a second round-trip.
 *
 * @returns A Kysely query builder selecting tag rows with joined category fields.
 */
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

    /**
     * Batched slug lookup. Used by deck-format validation so a deck with
     * several region tags doesn't fan out into N round-trips.
     *
     * @returns Rows for the slugs that exist, in undefined order. Each row
     *   includes the joined category slug so validators can check it without
     *   another query.
     */
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
      // Plain `.execute()` here: UPDATE without RETURNING always produces one
      // UpdateResult, so `executeTakeFirstOrThrow` wouldn't actually catch
      // "row not found". The route checks existence before calling.
      await db.updateTable("customTags").set(updates).where("id", "=", id).execute();
    },

    async deleteById(id: string): Promise<void> {
      // Same reasoning as `update`: DELETE without RETURNING never throws on
      // empty match. Existence is checked at the route boundary.
      await db.deleteFrom("customTags").where("id", "=", id).execute();
    },

    /** @returns Map of card id → array of custom-tag slugs (sorted). */
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

    /**
     * Scoped variant of {@link assignmentsByCard} for endpoints that only
     * need tag data for a known set of cards (e.g. the public share endpoint
     * denormalizing assignments for one deck's worth of cards).
     *
     * @returns Map of card id → custom-tag slugs (sorted), restricted to the
     *   requested ids. Cards with no tags are simply absent from the map.
     */
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

    /** @returns Custom-tag ids currently assigned to the given card. */
    async tagIdsForCard(cardId: string): Promise<string[]> {
      const rows = await db
        .selectFrom("cardCustomTags")
        .select("customTagId")
        .where("cardId", "=", cardId)
        .execute();
      return rows.map((r) => r.customTagId);
    },

    /** Replace the set of custom tags for a card. Atomic: clear then insert. */
    async setForCard(cardId: string, customTagIds: readonly string[]): Promise<void> {
      await db.deleteFrom("cardCustomTags").where("cardId", "=", cardId).execute();
      if (customTagIds.length === 0) {
        return;
      }
      await db
        .insertInto("cardCustomTags")
        .values(customTagIds.map((customTagId) => ({ cardId, customTagId })))
        .execute();
    },

    /**
     * Attach one tag to many cards. Idempotent: re-importing the same list
     * leaves untouched assignments alone and returns the count of newly added
     * (card, tag) pairs so the bulk-import UI can report what changed.
     *
     * @returns Number of new rows actually inserted.
     */
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

    /** @returns true if at least one card carries this custom tag. */
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

import type { Kysely } from "kysely";
import { sql } from "kysely";

import type { Database } from "../db/index.js";

export function promoTypesRepo(db: Kysely<Database>) {
  return {
    listAll() {
      return db
        .selectFrom("promoTypes")
        .selectAll()
        .orderBy("sortOrder")
        .orderBy("label")
        .execute();
    },

    getById(id: string) {
      return db.selectFrom("promoTypes").selectAll().where("id", "=", id).executeTakeFirst();
    },

    getBySlug(slug: string) {
      return db.selectFrom("promoTypes").selectAll().where("slug", "=", slug).executeTakeFirst();
    },

    create(values: { slug: string; label: string; sortOrder?: number }) {
      return db
        .insertInto("promoTypes")
        .values({
          slug: values.slug,
          label: values.label,
          sortOrder: values.sortOrder ?? 0,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    update(
      id: string,
      updates: { slug?: string; label?: string; sortOrder?: number; updatedAt?: Date },
    ) {
      return db
        .updateTable("promoTypes")
        .set(updates)
        .where("id", "=", id)
        .executeTakeFirstOrThrow();
    },

    deleteById(id: string) {
      return db.deleteFrom("promoTypes").where("id", "=", id).executeTakeFirstOrThrow();
    },

    isInUse(id: string) {
      return db
        .selectFrom("printings")
        .select("id")
        .where("promoTypeId", "=", id)
        .limit(1)
        .executeTakeFirst();
    },

    /** Bulk-update printing slugs by replacing a suffix substring.
     * @returns Resolves when the update is complete. */
    async renamePrintingSlugs(
      promoTypeId: string,
      oldSuffix: string,
      newSuffix: string,
    ): Promise<void> {
      await db
        .updateTable("printings")
        .set({
          slug: sql<string>`replace(slug, ${oldSuffix}, ${newSuffix})`,
        })
        .where("promoTypeId", "=", promoTypeId)
        .execute();
    },
  };
}

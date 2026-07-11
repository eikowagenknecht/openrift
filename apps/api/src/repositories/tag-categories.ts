import type { Kysely } from "kysely";
import { sql } from "kysely";

import type { Database } from "../db/index.js";

export function tagCategoriesRepo(db: Kysely<Database>) {
  return {
    listAll() {
      return db
        .selectFrom("tagCategories")
        .selectAll()
        .orderBy("sortOrder")
        .orderBy("label")
        .execute();
    },

    getById(id: string) {
      return db.selectFrom("tagCategories").selectAll().where("id", "=", id).executeTakeFirst();
    },

    getBySlug(slug: string) {
      return db.selectFrom("tagCategories").selectAll().where("slug", "=", slug).executeTakeFirst();
    },

    async getMaxSortOrder(): Promise<number> {
      const row = await db
        .selectFrom("tagCategories")
        .select((eb) => eb.fn.max("sortOrder").as("maxSortOrder"))
        .executeTakeFirst();
      return row?.maxSortOrder ?? -1;
    },

    create(values: {
      slug: string;
      label: string;
      description?: string | null;
      sortOrder?: number;
    }) {
      return db
        .insertInto("tagCategories")
        .values({
          slug: values.slug,
          label: values.label,
          description: values.description ?? null,
          ...(values.sortOrder === undefined ? {} : { sortOrder: values.sortOrder }),
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    async update(
      id: string,
      updates: {
        slug?: string;
        label?: string;
        description?: string | null;
      },
    ): Promise<void> {
      await db.updateTable("tagCategories").set(updates).where("id", "=", id).execute();
    },

    async deleteById(id: string): Promise<void> {
      await db.deleteFrom("tagCategories").where("id", "=", id).execute();
    },

    /** @returns true if at least one tag_definitions row uses this category. */
    async isInUse(id: string): Promise<boolean> {
      const row = await db
        .selectFrom("tagDefinitions")
        .select(sql<number>`1`.as("one"))
        .where("categoryId", "=", id)
        .limit(1)
        .executeTakeFirst();
      return row !== undefined;
    },
  };
}

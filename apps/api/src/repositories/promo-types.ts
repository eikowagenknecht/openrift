import type { Kysely } from "kysely";

import type { Database } from "../db/index.js";

export function promoTypesRepo(db: Kysely<Database>) {
  return {
    listAll() {
      return db.selectFrom("promoTypes").selectAll().orderBy("label").execute();
    },

    getById(id: string) {
      return db.selectFrom("promoTypes").selectAll().where("id", "=", id).executeTakeFirst();
    },

    getBySlug(slug: string) {
      return db.selectFrom("promoTypes").selectAll().where("slug", "=", slug).executeTakeFirst();
    },

    create(values: { slug: string; label: string; description?: string | null }) {
      return db
        .insertInto("promoTypes")
        .values({
          slug: values.slug,
          label: values.label,
          description: values.description ?? null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    update(
      id: string,
      updates: { slug?: string; label?: string; description?: string | null; updatedAt?: Date },
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
  };
}

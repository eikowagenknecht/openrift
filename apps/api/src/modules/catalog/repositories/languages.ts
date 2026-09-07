import type { Kysely } from "kysely";

import type { Database } from "../../../db/tables.js";
import { reorderBySortOrder } from "./sort-order.js";

export function languagesRepo(db: Kysely<Database>) {
  return {
    listAll() {
      return db.selectFrom("languages").selectAll().orderBy("sortOrder").orderBy("name").execute();
    },

    getByCode(code: string) {
      return db.selectFrom("languages").selectAll().where("code", "=", code).executeTakeFirst();
    },

    create(values: { code: string; name: string; color?: string | null; sortOrder?: number }) {
      return db
        .insertInto("languages")
        .values({
          code: values.code,
          name: values.name,
          color: values.color ?? null,
          sortOrder: values.sortOrder ?? 0,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    update(
      code: string,
      updates: { name?: string; color?: string | null; sortOrder?: number; updatedAt?: Date },
    ) {
      return db
        .updateTable("languages")
        .set(updates)
        .where("code", "=", code)
        .executeTakeFirstOrThrow();
    },

    deleteByCode(code: string) {
      return db.deleteFrom("languages").where("code", "=", code).executeTakeFirstOrThrow();
    },

    isInUse(code: string) {
      return db
        .selectFrom("printings")
        .select("id")
        .where("language", "=", code)
        .limit(1)
        .executeTakeFirst();
    },

    reorder(codes: readonly string[]): Promise<void> {
      return reorderBySortOrder(db, { table: "languages", keyColumn: "code", keys: codes });
    },
  };
}

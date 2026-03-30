import type { Kysely } from "kysely";
import { sql } from "kysely";

import type { Database } from "../db/index.js";

export function languagesRepo(db: Kysely<Database>) {
  return {
    listAll() {
      return db.selectFrom("languages").selectAll().orderBy("sortOrder").orderBy("name").execute();
    },

    getByCode(code: string) {
      return db.selectFrom("languages").selectAll().where("code", "=", code).executeTakeFirst();
    },

    create(values: { code: string; name: string; sortOrder?: number }) {
      return db
        .insertInto("languages")
        .values({
          code: values.code,
          name: values.name,
          sortOrder: values.sortOrder ?? 0,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    update(code: string, updates: { name?: string; sortOrder?: number; updatedAt?: Date }) {
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

    async reorder(codes: string[]): Promise<void> {
      if (codes.length === 0) {
        return;
      }
      const values = sql.join(codes.map((code, i) => sql`(${code}::text, ${i + 1}::int)`));
      await sql`
        update languages
        set sort_order = d.new_order
        from (values ${values}) as d(code, new_order)
        where languages.code = d.code
      `.execute(db);
    },
  };
}

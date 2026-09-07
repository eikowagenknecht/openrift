import type { Kysely } from "kysely";

import type { Database } from "../../../db/index.js";

const CITATION_COLUMNS = ["id", "printingId", "label", "sourceUrl", "sortOrder"] as const;

/** Both reads must order by `(sortOrder, id)`, matching the covering index. */
export function printingCitationsRepo(db: Kysely<Database>) {
  return {
    listForPrinting(printingId: string) {
      return db
        .selectFrom("printingCitations")
        .select(CITATION_COLUMNS)
        .where("printingId", "=", printingId)
        .orderBy("sortOrder")
        .orderBy("id")
        .execute();
    },

    /** Empty input short-circuits: Postgres rejects `WHERE id IN ()`. */
    listForPrintingIds(printingIds: readonly string[]) {
      if (printingIds.length === 0) {
        return Promise.resolve([]);
      }
      return db
        .selectFrom("printingCitations")
        .select(CITATION_COLUMNS)
        .where("printingId", "in", printingIds)
        .orderBy("sortOrder")
        .orderBy("id")
        .execute();
    },

    async insert(data: { printingId: string; label: string; sourceUrl: string | null }) {
      const last = await db
        .selectFrom("printingCitations")
        .select("sortOrder")
        .where("printingId", "=", data.printingId)
        .orderBy("sortOrder", "desc")
        .limit(1)
        .executeTakeFirst();

      return db
        .insertInto("printingCitations")
        .values({
          printingId: data.printingId,
          label: data.label,
          sourceUrl: data.sourceUrl,
          sortOrder: last === undefined ? 0 : last.sortOrder + 1,
        })
        .returning(CITATION_COLUMNS)
        .executeTakeFirstOrThrow();
    },

    /**
     * `sortOrder` is deliberately not writable: a citation moves only by being
     * added, so an edit cannot reorder the list behind the reader's back.
     */
    async update(
      id: string,
      data: { label?: string; sourceUrl?: string | null },
    ): Promise<string | undefined> {
      // Kysely compiles an empty SET to invalid SQL, and a caller PATCHing
      // nothing still expects the row's existence to be confirmed.
      if (data.label === undefined && !Object.hasOwn(data, "sourceUrl")) {
        const existing = await db
          .selectFrom("printingCitations")
          .select("id")
          .where("id", "=", id)
          .executeTakeFirst();
        return existing?.id;
      }

      const row = await db
        .updateTable("printingCitations")
        .set({
          ...(data.label === undefined ? {} : { label: data.label }),
          ...(Object.hasOwn(data, "sourceUrl") ? { sourceUrl: data.sourceUrl } : {}),
        })
        .where("id", "=", id)
        .returning("id")
        .executeTakeFirst();
      return row?.id;
    },

    async delete(id: string): Promise<string | undefined> {
      const row = await db
        .deleteFrom("printingCitations")
        .where("id", "=", id)
        .returning("id")
        .executeTakeFirst();
      return row?.id;
    },
  };
}

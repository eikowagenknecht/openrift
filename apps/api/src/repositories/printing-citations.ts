import type { Kysely } from "kysely";

import type { Database } from "../db/index.js";

/** Columns every citation read in this repo selects. */
const CITATION_COLUMNS = ["id", "printingId", "label", "sourceUrl", "sortOrder"] as const;

/**
 * Source citations for promo printings (migration 258): the videos and posts
 * backing what the catalog says about where a card came from.
 *
 * Both reads order by `(sortOrder, id)`, matching the covering index, so a page
 * of hand-ordered citations cannot reshuffle between requests.
 *
 * @returns An object with printing-citation methods bound to the given `db`.
 */
export function printingCitationsRepo(db: Kysely<Database>) {
  return {
    /**
     * Every citation for one printing, in display order.
     * @returns The printing's citation rows.
     */
    listForPrinting(printingId: string) {
      return db
        .selectFrom("printingCitations")
        .select(CITATION_COLUMNS)
        .where("printingId", "=", printingId)
        .orderBy("sortOrder")
        .orderBy("id")
        .execute();
    },

    /**
     * Citations for a batch of printings, for the catalog reads that decorate
     * many printings at once. An empty input short-circuits rather than
     * building a `WHERE id IN ()`, which Postgres rejects.
     * @returns Citation rows across all requested printings, in display order.
     */
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

    /**
     * Append a citation to a printing. `sortOrder` lands one past the current
     * maximum so a new citation sorts last without the caller tracking
     * positions.
     * @returns The inserted row.
     */
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
     * Delete one citation.
     * @returns The deleted row's id, or undefined when nothing matched.
     */
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

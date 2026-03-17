import type { DeleteResult, Kysely, Selectable } from "kysely";
import { sql } from "kysely";

import type {
  Database,
  IgnoredCardSourcesTable,
  IgnoredPrintingSourcesTable,
} from "../db/index.js";

/**
 * Queries for permanently ignored card/printing sources.
 *
 * @returns An object with ignored-source query methods bound to the given `db`.
 */
export function ignoredSourcesRepo(db: Kysely<Database>) {
  return {
    // ── Card sources ──────────────────────────────────────────────────────────

    /** @returns All ignored card sources, newest first. */
    listIgnoredCards(): Promise<Selectable<IgnoredCardSourcesTable>[]> {
      return db.selectFrom("ignoredCardSources").selectAll().orderBy("createdAt", "desc").execute();
    },

    /** @returns The ignored entry if it exists, or `undefined`. */
    getIgnoredCard(
      source: string,
      sourceEntityId: string,
    ): Promise<Selectable<IgnoredCardSourcesTable> | undefined> {
      return db
        .selectFrom("ignoredCardSources")
        .selectAll()
        .where("source", "=", source)
        .where("sourceEntityId", "=", sourceEntityId)
        .executeTakeFirst();
    },

    /** Insert ignored card source (no-op on conflict). */
    async ignoreCard(values: { source: string; sourceEntityId: string }): Promise<void> {
      await db
        .insertInto("ignoredCardSources")
        .values(values)
        .onConflict((oc) => oc.columns(["source", "sourceEntityId"]).doNothing())
        .execute();
    },

    /** @returns Delete result — check `numDeletedRows` to verify the row existed. */
    unignoreCard(source: string, sourceEntityId: string): Promise<DeleteResult> {
      return db
        .deleteFrom("ignoredCardSources")
        .where("source", "=", source)
        .where("sourceEntityId", "=", sourceEntityId)
        .executeTakeFirst();
    },

    // ── Printing sources ──────────────────────────────────────────────────────

    /** @returns All ignored printing sources, newest first. */
    listIgnoredPrintings(): Promise<Selectable<IgnoredPrintingSourcesTable>[]> {
      return db
        .selectFrom("ignoredPrintingSources")
        .selectAll()
        .orderBy("createdAt", "desc")
        .execute();
    },

    /** @returns The ignored entry if it exists, or `undefined`. */
    getIgnoredPrinting(
      source: string,
      sourceEntityId: string,
    ): Promise<Selectable<IgnoredPrintingSourcesTable> | undefined> {
      return db
        .selectFrom("ignoredPrintingSources")
        .selectAll()
        .where("source", "=", source)
        .where("sourceEntityId", "=", sourceEntityId)
        .executeTakeFirst();
    },

    /** Insert ignored printing source (no-op on conflict). */
    async ignorePrinting(values: {
      source: string;
      sourceEntityId: string;
      finish: string | null;
    }): Promise<void> {
      await db
        .insertInto("ignoredPrintingSources")
        .values(values)
        .onConflict((oc) =>
          oc.expression(sql`source, source_entity_id, COALESCE(finish, '')`).doNothing(),
        )
        .execute();
    },

    /** @returns Delete result — check `numDeletedRows` to verify the row existed. */
    unignorePrinting(
      source: string,
      sourceEntityId: string,
      finish: string | null,
    ): Promise<DeleteResult> {
      return db
        .deleteFrom("ignoredPrintingSources")
        .where("source", "=", source)
        .where("sourceEntityId", "=", sourceEntityId)
        .where(
          finish === null ? (eb) => eb("finish", "is", null) : (eb) => eb("finish", "=", finish),
        )
        .executeTakeFirst();
    },
  };
}

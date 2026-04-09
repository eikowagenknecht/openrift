import type { DeleteResult, Kysely, Selectable } from "kysely";
import { sql } from "kysely";

import type {
  Database,
  IgnoredCandidateCardsTable,
  IgnoredCandidatePrintingsTable,
} from "../db/index.js";

/**
 * Queries for permanently ignored candidate cards/printings.
 *
 * @returns An object with ignored-candidate query methods bound to the given `db`.
 */
export function ignoredCandidatesRepo(db: Kysely<Database>) {
  return {
    // ── Candidate cards ──────────────────────────────────────────────────────────

    /** @returns All ignored candidate cards, newest first. */
    listIgnoredCards(): Promise<Selectable<IgnoredCandidateCardsTable>[]> {
      return db
        .selectFrom("ignoredCandidateCards")
        .selectAll()
        .orderBy("createdAt", "desc")
        .execute();
    },

    /** Insert ignored candidate card (no-op on conflict). */
    async ignoreCard(values: { provider: string; externalId: string }): Promise<void> {
      await db
        .insertInto("ignoredCandidateCards")
        .values(values)
        .onConflict((oc) => oc.columns(["provider", "externalId"]).doNothing())
        .execute();
    },

    /** @returns Delete result — check `numDeletedRows` to verify the row existed. */
    unignoreCard(provider: string, externalId: string): Promise<DeleteResult> {
      return db
        .deleteFrom("ignoredCandidateCards")
        .where("provider", "=", provider)
        .where("externalId", "=", externalId)
        .executeTakeFirst();
    },

    // ── Candidate printings ──────────────────────────────────────────────────────

    /** @returns All ignored candidate printings, newest first. */
    listIgnoredPrintings(): Promise<Selectable<IgnoredCandidatePrintingsTable>[]> {
      return db
        .selectFrom("ignoredCandidatePrintings")
        .selectAll()
        .orderBy("createdAt", "desc")
        .execute();
    },

    /** Insert ignored candidate printing (no-op on conflict). */
    async ignorePrinting(values: {
      provider: string;
      externalId: string;
      finish: string | null;
    }): Promise<void> {
      await db
        .insertInto("ignoredCandidatePrintings")
        .values(values)
        .onConflict((oc) =>
          oc.expression(sql`provider, external_id, COALESCE(finish, '')`).doNothing(),
        )
        .execute();
    },

    /** @returns Delete result — check `numDeletedRows` to verify the row existed. */
    unignorePrinting(
      provider: string,
      externalId: string,
      finish: string | null,
    ): Promise<DeleteResult> {
      return db
        .deleteFrom("ignoredCandidatePrintings")
        .where("provider", "=", provider)
        .where("externalId", "=", externalId)
        .where(
          finish === null ? (eb) => eb("finish", "is", null) : (eb) => eb("finish", "=", finish),
        )
        .executeTakeFirst();
    },
  };
}

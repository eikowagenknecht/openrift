import type { DeleteResult, Kysely, Selectable } from "kysely";
import { sql } from "kysely";

import type {
  Database,
  IgnoredCandidateCardsTable,
  IgnoredCandidatePrintingsTable,
} from "../db/index.js";

export function ignoredCandidatesRepo(db: Kysely<Database>) {
  return {
    listIgnoredCards(): Promise<Selectable<IgnoredCandidateCardsTable>[]> {
      return db
        .selectFrom("ignoredCandidateCards")
        .selectAll()
        .orderBy("createdAt", "desc")
        .execute();
    },

    async ignoreCard(values: { provider: string; externalId: string }): Promise<void> {
      await db
        .insertInto("ignoredCandidateCards")
        .values(values)
        .onConflict((oc) => oc.columns(["provider", "externalId"]).doNothing())
        .execute();
    },

    unignoreCard(provider: string, externalId: string): Promise<DeleteResult> {
      return db
        .deleteFrom("ignoredCandidateCards")
        .where("provider", "=", provider)
        .where("externalId", "=", externalId)
        .executeTakeFirst();
    },

    listIgnoredPrintings(): Promise<Selectable<IgnoredCandidatePrintingsTable>[]> {
      return db
        .selectFrom("ignoredCandidatePrintings")
        .selectAll()
        .orderBy("createdAt", "desc")
        .execute();
    },

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

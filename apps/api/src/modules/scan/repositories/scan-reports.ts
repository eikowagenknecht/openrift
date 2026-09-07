import type { ScanReportJournalEntry } from "@openrift/shared/contracts/scan-reports";
import type { Kysely } from "kysely";
import { sql } from "kysely";

import type { Database } from "../../../db/tables.js";

export function scanReportsRepo(db: Kysely<Database>) {
  return {
    /** Serializes one user's concurrent reports so the hourly cap can't be read twice before either insert. */
    async lockUser(userId: string): Promise<void> {
      await sql`select pg_advisory_xact_lock(hashtext(${`scan_report:${userId}`}))`.execute(db);
    },

    async countRecentByUser(userId: string, since: Date): Promise<number> {
      const row = await db
        .selectFrom("scanReports")
        .select((eb) => eb.fn.countAll<string>().as("count"))
        .where("userId", "=", userId)
        .where("createdAt", ">=", since)
        .executeTakeFirst();
      return row ? Number(row.count) : 0;
    },

    async referenceExists(reference: string): Promise<boolean> {
      const row = await db
        .selectFrom("scanReports")
        .select("id")
        .where("reference", "=", reference)
        .executeTakeFirst();
      return row !== undefined;
    },

    async insert(values: {
      userId: string;
      reference: string;
      note: string | null;
      userAgent: string | null;
      journal: ScanReportJournalEntry[];
    }): Promise<void> {
      await db.insertInto("scanReports").values(values).execute();
    },
  };
}

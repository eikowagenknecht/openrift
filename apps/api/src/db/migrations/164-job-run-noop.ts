import type { Kysely } from "kysely";
import { sql } from "kysely";

// Adds the activity axis to job_runs: `noop` is true when a succeeded run found
// nothing to do, false when it did work, and null when the run wasn't
// classified (failed runs, jobs without a classifier, and pre-migration rows).
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("job_runs").addColumn("noop", "boolean").execute();

  // One-time backfill for the classified kinds. This mirrors the TS classifier
  // predicates (isPrintingFlushNoop, isTradeRequestFlushNoop, etc.) as a frozen
  // snapshot — a migration must stay self-contained, so we can't import those
  // functions (a later refactor would break this immutable history).
  //
  // `result` is double-encoded: the repo writes it via JSON.stringify into a
  // jsonb column, so the stored value is a jsonb *string*. `(result #>> '{}')`
  // unwraps that back to the JSON text, which `::jsonb` re-parses to the object
  // (this also tolerates any rows stored as a plain object). Only succeeded,
  // still-unclassified rows with a result are touched; every other row stays
  // null. COALESCE treats a missing count as 0.
  const backfills: { kind: string; fields: string[] }[] = [
    { kind: "discord.flush_printing_events", fields: ["sent", "failed"] },
    { kind: "email.flush_trade_requests", fields: ["pairs", "emailsSent", "requests"] },
    { kind: "email.trade_match_digest", fields: ["recipients", "emailsSent", "matches"] },
    { kind: "card_trades.expire_pending", fields: ["expired"] },
    { kind: "job_runs.cleanup", fields: ["deleted"] },
  ];

  for (const { kind, fields } of backfills) {
    const allZero = fields
      .map((field) => sql`COALESCE(((result #>> '{}')::jsonb ->> ${field})::int, 0) = 0`)
      .reduce((left, right) => sql`${left} AND ${right}`);
    await sql`
      UPDATE job_runs
      SET noop = (${allZero})
      WHERE status = 'succeeded'
        AND noop IS NULL
        AND result IS NOT NULL
        AND kind = ${kind}
    `.execute(db);
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("job_runs").dropColumn("noop").execute();
}

import type { Kysely } from "kysely";
import { sql } from "kysely";

// ADR-030 follow-up: email the party who *didn't* act when a trade is accepted
// (reserved), declined, or cancelled. Coalesced per actor→recipient burst by a
// flush cron, reusing the trade-request cadence — so accepting a basket of ten
// cards sends one email, not ten.
//
// Two per-trade markers, because a single trade can legitimately fire two
// emails across its life (reserved, then later cancelled-from-reserved):
//   reserved_email_sent_at — NULL = the reserve email is still queued.
//   closed_email_sent_at   — NULL = the decline/cancel email is still queued.
// Both are stamped by a guarded UPDATE in the flush (or to suppress an opted-out
// recipient), so each event is emailed at most once. The transition SQL never
// touches these columns: a fresh transition leaves the marker NULL, and the new
// `status` is what the flush scans for.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("card_trades")
    .addColumn("reserved_email_sent_at", "timestamptz")
    .addColumn("closed_email_sent_at", "timestamptz")
    .execute();

  // Backfill so the first flush doesn't blast every historical transition.
  // Anything already past the reserve point is marked reserve-emailed; anything
  // already closed is marked close-emailed. Pending/reserved rows keep NULL
  // markers so only *future* transitions queue an email.
  await sql`
    UPDATE card_trades
      SET reserved_email_sent_at = now()
      WHERE status <> 'pending'
  `.execute(db);
  await sql`
    UPDATE card_trades
      SET closed_email_sent_at = now()
      WHERE status IN ('declined', 'cancelled', 'completed', 'expired')
  `.execute(db);

  // Drive the two flush scans: the queued (un-notified) reserved and closed
  // rows. Partial so they stay tiny — most rows are notified or pending.
  await sql`
    CREATE INDEX idx_card_trades_reserved_email_pending
      ON card_trades (updated_at)
      WHERE reserved_email_sent_at IS NULL AND status = 'reserved'
  `.execute(db);
  await sql`
    CREATE INDEX idx_card_trades_closed_email_pending
      ON card_trades (updated_at)
      WHERE closed_email_sent_at IS NULL AND status IN ('declined', 'cancelled')
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex("idx_card_trades_closed_email_pending").execute();
  await db.schema.dropIndex("idx_card_trades_reserved_email_pending").execute();
  await db.schema
    .alterTable("card_trades")
    .dropColumn("closed_email_sent_at")
    .dropColumn("reserved_email_sent_at")
    .execute();
}

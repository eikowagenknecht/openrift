import type { Kysely } from "kysely";
import { sql } from "kysely";

// ADR-030 follow-up: coalesce a burst of trade requests from the same sender to
// the same recipient. The first request emails instantly; further requests
// within a short window are queued and folded into one digest email by a flush
// cron.
//
// `request_email_sent_at` is the per-trade marker: NULL = the recipient has not
// yet been emailed about this request (queued); non-null = an email (instant or
// coalesced) has covered it, or it was suppressed (recipient opted out). The
// leading-edge throttle and the flush both stamp it with a guarded UPDATE, so a
// trade is emailed at most once.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("card_trades")
    .addColumn("request_email_sent_at", "timestamptz")
    .execute();

  // Drives the flush scan: the queued (un-notified) pending requests it must
  // consider. Partial so it stays tiny — most rows are notified or terminal.
  await sql`
    CREATE INDEX idx_card_trades_request_email_pending
      ON card_trades (created_at)
      WHERE request_email_sent_at IS NULL AND status = 'pending'
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex("idx_card_trades_request_email_pending").execute();
  await db.schema.alterTable("card_trades").dropColumn("request_email_sent_at").execute();
}

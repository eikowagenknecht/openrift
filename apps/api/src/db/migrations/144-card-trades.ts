import type { Kysely } from "kysely";
import { sql } from "kysely";

// In-app trade execution for friend groups (ADR-019).
//
// Two tables. card_trades is one card moving in one direction between two
// members of one group, with an explicit state machine
// (pending → reserved → completed, plus declined/cancelled/expired). Roles are
// stored explicitly (giver owns the copies, receiver wants the card) and do not
// depend on who clicked first; `initiator` records which side started it.
//
// card_trade_copies pins the concrete copies a reserved trade has claimed. Rows
// exist iff a copy is currently reserved (or completed-pending-giver-sync), so
// the match query excludes reserved copies with a bare NOT EXISTS — no status
// join needed. UNIQUE(copy_id) guarantees a physical card is promised to at
// most one live trade, globally (not group-scoped).
export async function up(db: Kysely<unknown>): Promise<void> {
  // ── 1. card_trades ─────────────────────────────────────────────────────────
  await db.schema
    .createTable("card_trades")
    .addColumn("id", "uuid", (col) => col.defaultTo(sql`uuidv7()`).primaryKey())
    .addColumn("group_id", "uuid", (col) => col.notNull())
    .addColumn("giver_user_id", "text", (col) => col.notNull())
    .addColumn("receiver_user_id", "text", (col) => col.notNull())
    .addColumn("initiator", "text", (col) => col.notNull())
    .addColumn("printing_id", "uuid", (col) => col.notNull())
    .addColumn("card_id", "uuid", (col) => col.notNull())
    .addColumn("quantity", "integer", (col) => col.notNull())
    .addColumn("status", "text", (col) => col.notNull().defaultTo("pending"))
    // Demand-side sync target, snapshotted from the match; nulled if the wish
    // entry is later deleted.
    .addColumn("receiver_wish_entry_id", "uuid")
    .addColumn("last_actor_user_id", "text")
    .addColumn("giver_sync_applied_at", "timestamptz")
    .addColumn("receiver_sync_applied_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("updated_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("accepted_at", "timestamptz")
    .addColumn("completed_at", "timestamptz")
    // declined / cancelled / expired
    .addColumn("closed_at", "timestamptz")
    // pending TTL (created_at + 24h); cleared once not pending
    .addColumn("expires_at", "timestamptz")
    .addCheckConstraint("chk_card_trades_initiator", sql`initiator IN ('giver', 'receiver')`)
    .addCheckConstraint("chk_card_trades_quantity", sql`quantity > 0`)
    .addCheckConstraint(
      "chk_card_trades_status",
      sql`status IN ('pending', 'reserved', 'completed', 'declined', 'cancelled', 'expired')`,
    )
    .addCheckConstraint("chk_card_trades_distinct_parties", sql`giver_user_id <> receiver_user_id`)
    .execute();

  await db.schema
    .alterTable("card_trades")
    .addForeignKeyConstraint("card_trades_group_id_fkey", ["group_id"], "friend_groups", ["id"])
    .onDelete("cascade")
    .execute();

  await db.schema
    .alterTable("card_trades")
    .addForeignKeyConstraint("card_trades_giver_user_id_fkey", ["giver_user_id"], "users", ["id"])
    .onDelete("cascade")
    .execute();

  await db.schema
    .alterTable("card_trades")
    .addForeignKeyConstraint("card_trades_receiver_user_id_fkey", ["receiver_user_id"], "users", [
      "id",
    ])
    .onDelete("cascade")
    .execute();

  await db.schema
    .alterTable("card_trades")
    .addForeignKeyConstraint("card_trades_printing_id_fkey", ["printing_id"], "printings", ["id"])
    .execute();

  await db.schema
    .alterTable("card_trades")
    .addForeignKeyConstraint("card_trades_card_id_fkey", ["card_id"], "cards", ["id"])
    .execute();

  // The wish entry can be deleted (e.g. the receiver edits their wishlist)
  // without voiding the trade — the sync just skips the decrement.
  await db.schema
    .alterTable("card_trades")
    .addForeignKeyConstraint(
      "card_trades_receiver_wish_entry_id_fkey",
      ["receiver_wish_entry_id"],
      "list_entries",
      ["id"],
    )
    .onDelete("set null")
    .execute();

  // last_actor = NULL means "system" (cron expiry). SET NULL on account
  // deletion keeps the trade row valid for the surviving counterparty.
  await db.schema
    .alterTable("card_trades")
    .addForeignKeyConstraint(
      "card_trades_last_actor_user_id_fkey",
      ["last_actor_user_id"],
      "users",
      ["id"],
    )
    .onDelete("set null")
    .execute();

  await db.schema
    .createIndex("idx_card_trades_receiver")
    .on("card_trades")
    .columns(["receiver_user_id", "status"])
    .execute();

  await db.schema
    .createIndex("idx_card_trades_giver")
    .on("card_trades")
    .columns(["giver_user_id", "status"])
    .execute();

  await db.schema
    .createIndex("idx_card_trades_group")
    .on("card_trades")
    .columns(["group_id", "status"])
    .execute();

  // Keeps the every-15-minutes expiry scan cheap.
  await sql`
    CREATE INDEX idx_card_trades_expiry
      ON card_trades (expires_at) WHERE status = 'pending'
  `.execute(db);

  // At most one *live* trade per card between the same two members in a group,
  // regardless of who initiated (giver/receiver are fixed by who owns copies).
  await sql`
    CREATE UNIQUE INDEX uq_card_trades_live
      ON card_trades (group_id, giver_user_id, receiver_user_id, printing_id)
      WHERE status IN ('pending', 'reserved')
  `.execute(db);

  // NOTE: deliberately NOT attaching the shared set_updated_at trigger. The
  // repository sets updated_at = now() explicitly on real state transitions
  // (accept/decline/cancel/complete/expire) to drive the newest-first ordering,
  // and leaves it untouched for the private sync-applied writes.

  // ── 2. card_trade_copies ─────────────────────────────────────────────────
  // The set of copies *currently* claimed by a live trade. Rows exist iff a
  // copy is reserved or completed-pending-giver-sync; cleaned up on release or
  // consume. This is what the match query excludes and what giver-sync deletes.
  await db.schema
    .createTable("card_trade_copies")
    .addColumn("trade_id", "uuid", (col) => col.notNull())
    .addColumn("copy_id", "uuid", (col) => col.notNull())
    .addPrimaryKeyConstraint("card_trade_copies_pkey", ["trade_id", "copy_id"])
    // A copy is claimed by at most one live trade.
    .addUniqueConstraint("uq_card_trade_copies_copy", ["copy_id"])
    .execute();

  await db.schema
    .alterTable("card_trade_copies")
    .addForeignKeyConstraint("card_trade_copies_trade_id_fkey", ["trade_id"], "card_trades", ["id"])
    .onDelete("cascade")
    .execute();

  // ON DELETE CASCADE here is only a backstop for account deletion
  // (users → copies → card_trade_copies). Giver-sync deletes these rows
  // explicitly before disposing, so the cascade does not normally fire.
  await db.schema
    .alterTable("card_trade_copies")
    .addForeignKeyConstraint("card_trade_copies_copy_id_fkey", ["copy_id"], "copies", ["id"])
    .onDelete("cascade")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("card_trade_copies").execute();
  await db.schema.dropTable("card_trades").execute();
}

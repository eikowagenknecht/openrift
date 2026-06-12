import type { Kysely } from "kysely";
import { sql } from "kysely";

// Player self-service for deck checks (ADR-026). Fills in the account link
// ADR-025 reserved (`claimed_user_id`), adds list ownership for edit-takeover,
// a player-visible message separate from the judge-private notes, and the
// per-event self-submission opt-in.
export async function up(db: Kysely<unknown>): Promise<void> {
  // ── 1. deck_check_entries: account link, list ownership, player message ───
  await db.schema
    .alterTable("deck_check_entries")
    .addColumn("claimed_user_id", "text")
    .addColumn("claim_source", "text")
    .addColumn("claimed_at", "timestamptz")
    // Set on judge unlink; blocks every auto-match path from re-linking.
    .addColumn("claim_blocked_at", "timestamptz")
    .addColumn("list_owner", "text", (col) => col.defaultTo("provider").notNull())
    .addColumn("player_message", "text")
    .addColumn("provider_push_ignored_at", "timestamptz")
    .execute();

  await db.schema
    .alterTable("deck_check_entries")
    .addForeignKeyConstraint("deck_check_entries_claimed_user_fkey", ["claimed_user_id"], "users", [
      "id",
    ])
    .onDelete("set null")
    .execute();

  await sql`
    ALTER TABLE deck_check_entries
      ADD CONSTRAINT chk_deck_check_entries_claim_source
        CHECK (claim_source IS NULL OR claim_source = ANY (ARRAY['email_auto'::text, 'judge_manual'::text, 'self_submit'::text])),
      ADD CONSTRAINT chk_deck_check_entries_list_owner
        CHECK (list_owner = ANY (ARRAY['provider'::text, 'player'::text])),
      ADD CONSTRAINT chk_deck_check_entries_player_message
        CHECK (player_message IS NULL OR length(player_message) <= 2000)
  `.execute(db);

  await db.schema
    .createIndex("idx_deck_check_entries_claimed_user")
    .on("deck_check_entries")
    .column("claimed_user_id")
    .execute();

  // Serves the lazy auto-match lookup by the viewer's verified email.
  await sql`
    CREATE INDEX idx_deck_check_entries_player_email
      ON deck_check_entries (lower(player_email))
  `.execute(db);

  // ── 2. deck_check_events: self-submission opt-in ──────────────────────────
  await db.schema
    .alterTable("deck_check_events")
    .addColumn("allow_self_submission", "boolean", (col) => col.defaultTo(false).notNull())
    .addColumn("submission_token", "text", (col) => col.unique())
    .addColumn("submissions_close_at", "timestamptz")
    .execute();

  // ── 3. Backfill: auto-match existing entries by verified email ────────────
  // Same rule the ingest-time and lazy matches apply: case-insensitive email
  // equality against a verified account, never overwriting an existing link.
  await sql`
    UPDATE deck_check_entries en
       SET claimed_user_id = u.id,
           claim_source = 'email_auto',
           claimed_at = now()
      FROM users u
     WHERE en.claimed_user_id IS NULL
       AND en.claim_blocked_at IS NULL
       AND en.player_email IS NOT NULL
       AND lower(en.player_email) = lower(u.email)
       AND u.email_verified
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("deck_check_events")
    .dropColumn("allow_self_submission")
    .dropColumn("submission_token")
    .dropColumn("submissions_close_at")
    .execute();

  await sql`DROP INDEX IF EXISTS idx_deck_check_entries_player_email`.execute(db);
  await sql`DROP INDEX IF EXISTS idx_deck_check_entries_claimed_user`.execute(db);

  await db.schema
    .alterTable("deck_check_entries")
    .dropColumn("claimed_user_id")
    .dropColumn("claim_source")
    .dropColumn("claimed_at")
    .dropColumn("claim_blocked_at")
    .dropColumn("list_owner")
    .dropColumn("player_message")
    .dropColumn("provider_push_ignored_at")
    .execute();
}

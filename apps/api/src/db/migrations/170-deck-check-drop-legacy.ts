import type { Kysely } from "kysely";
import { sql } from "kysely";

// ADR-033 Phase 3b (destructive) — drop the legacy deck-check structures now
// that 169 backfilled the umbrella. Removes the entry's inline identity + claim
// columns (now on tournament_participants) and event_id, re-keys integration
// keys to the host, retires the friend-group `judge` role (judging lives in
// tournament_staff), and drops deck_check_events. Split from 169 so a rollback
// before this lands never loses data.
export async function up(db: Kysely<unknown>): Promise<void> {
  // ── 1. Entries: every entry now belongs to a tournament + participant ─────
  await sql`ALTER TABLE deck_check_entries ALTER COLUMN tournament_id SET NOT NULL`.execute(db);
  await db.schema
    .alterTable("deck_check_entries")
    .dropConstraint("uq_deck_check_entries_event_external")
    .execute();
  await db.schema
    .alterTable("deck_check_entries")
    .addUniqueConstraint("uq_deck_check_entries_tournament_external", [
      "tournament_id",
      "external_id",
    ])
    .execute();

  await db.schema
    .alterTable("deck_check_entries")
    .dropConstraint("deck_check_entries_event_fkey")
    .execute();
  await db.schema
    .alterTable("deck_check_entries")
    .dropConstraint("deck_check_entries_claimed_user_fkey")
    .execute();
  await db.schema.dropIndex("idx_deck_check_entries_event").execute();
  await db.schema.dropIndex("idx_deck_check_entries_claimed_user").execute();
  await db.schema.dropIndex("idx_deck_check_entries_player_email").execute();
  await db.schema
    .alterTable("deck_check_entries")
    .dropConstraint("deck_check_entries_claim_token_key")
    .execute();
  await db.schema
    .alterTable("deck_check_entries")
    .dropConstraint("chk_deck_check_entries_player_name")
    .execute();
  await db.schema
    .alterTable("deck_check_entries")
    .dropConstraint("chk_deck_check_entries_player_email")
    .execute();
  await db.schema
    .alterTable("deck_check_entries")
    .dropConstraint("chk_deck_check_entries_riot_id")
    .execute();
  await db.schema
    .alterTable("deck_check_entries")
    .dropConstraint("chk_deck_check_entries_claim_source")
    .execute();
  await db.schema
    .alterTable("deck_check_entries")
    .dropColumn("event_id")
    .dropColumn("player_name")
    .dropColumn("player_email")
    .dropColumn("riot_id")
    .dropColumn("claimed_user_id")
    .dropColumn("claim_source")
    .dropColumn("claim_token")
    .dropColumn("claimed_at")
    .dropColumn("claim_blocked_at")
    .execute();

  // ── 2. Keys: host-scoped, no longer group-scoped ──────────────────────────
  await db.schema
    .alterTable("deck_check_keys")
    .addCheckConstraint(
      "chk_deck_check_keys_host",
      sql`(host_type = 'user'         AND host_user_id IS NOT NULL AND host_org_id IS NULL) OR
          (host_type = 'organization' AND host_org_id  IS NOT NULL AND host_user_id IS NULL)`,
    )
    .execute();
  await sql`ALTER TABLE deck_check_keys ALTER COLUMN host_type SET NOT NULL`.execute(db);
  await db.schema
    .alterTable("deck_check_keys")
    .addForeignKeyConstraint("deck_check_keys_host_user_fkey", ["host_user_id"], "users", ["id"])
    .onDelete("cascade")
    .execute();
  await db.schema
    .alterTable("deck_check_keys")
    .addForeignKeyConstraint("deck_check_keys_host_org_fkey", ["host_org_id"], "organizations", [
      "id",
    ])
    .onDelete("cascade")
    .execute();
  await db.schema
    .alterTable("deck_check_keys")
    .dropConstraint("deck_check_keys_group_fkey")
    .execute();
  await db.schema.dropIndex("idx_deck_check_keys_group").execute();
  await db.schema.alterTable("deck_check_keys").dropColumn("group_id").execute();

  // ── 3. Retire the friend-group judge role (judging is tournament_staff now) ─
  await sql`UPDATE friend_group_members SET role = 'member' WHERE role = 'judge'`.execute(db);
  await sql`ALTER TABLE friend_group_members DROP CONSTRAINT chk_friend_group_members_role`.execute(
    db,
  );
  await sql`
    ALTER TABLE friend_group_members
      ADD CONSTRAINT chk_friend_group_members_role
        CHECK (role = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text]))
  `.execute(db);

  // ── 4. Drop the absorbed events table ─────────────────────────────────────
  await db.schema.dropTable("deck_check_events").execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // ── 4. Recreate deck_check_events (its full pre-170 shape) ────────────────
  await db.schema
    .createTable("deck_check_events")
    .addColumn("id", "uuid", (col) => col.defaultTo(sql`uuidv7()`).primaryKey())
    .addColumn("group_id", "uuid", (col) => col.notNull())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("event_date", "date")
    .addColumn("format", "text")
    .addColumn("allowed_sets", "jsonb")
    .addColumn("status", "text", (col) => col.defaultTo("active").notNull())
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("updated_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("allow_self_submission", "boolean", (col) => col.defaultTo(false).notNull())
    .addColumn("submission_token", "text")
    .addColumn("submissions_close_at", "timestamptz")
    .addColumn("list_lock_mode", "text", (col) => col.defaultTo("on_submit").notNull())
    .addCheckConstraint("chk_deck_check_events_name", sql`length(name) BETWEEN 1 AND 120`)
    .addCheckConstraint("chk_deck_check_events_status", sql`status IN ('active', 'archived')`)
    .addCheckConstraint(
      "chk_deck_check_events_list_lock_mode",
      sql`list_lock_mode IN ('on_submit', 'at_deadline')`,
    )
    .addUniqueConstraint("deck_check_events_submission_token_key", ["submission_token"])
    .execute();
  await db.schema
    .alterTable("deck_check_events")
    .addForeignKeyConstraint("deck_check_events_group_fkey", ["group_id"], "friend_groups", ["id"])
    .onDelete("cascade")
    .execute();
  await db.schema
    .alterTable("deck_check_events")
    .addForeignKeyConstraint("deck_check_events_format_fkey", ["format"], "deck_formats", ["slug"])
    .execute();
  await db.schema
    .createIndex("idx_deck_check_events_group")
    .on("deck_check_events")
    .column("group_id")
    .execute();
  await sql`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON deck_check_events
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `.execute(db);

  // ── 3. Restore the friend-group judge role ────────────────────────────────
  await sql`ALTER TABLE friend_group_members DROP CONSTRAINT chk_friend_group_members_role`.execute(
    db,
  );
  await sql`
    ALTER TABLE friend_group_members
      ADD CONSTRAINT chk_friend_group_members_role
        CHECK (role = ANY (ARRAY['owner'::text, 'admin'::text, 'judge'::text, 'member'::text]))
  `.execute(db);

  // ── 2. Restore group-scoped keys ──────────────────────────────────────────
  await db.schema
    .alterTable("deck_check_keys")
    .dropConstraint("deck_check_keys_host_org_fkey")
    .execute();
  await db.schema
    .alterTable("deck_check_keys")
    .dropConstraint("deck_check_keys_host_user_fkey")
    .execute();
  await db.schema
    .alterTable("deck_check_keys")
    .dropConstraint("chk_deck_check_keys_host")
    .execute();
  await sql`ALTER TABLE deck_check_keys ALTER COLUMN host_type DROP NOT NULL`.execute(db);
  await db.schema.alterTable("deck_check_keys").addColumn("group_id", "uuid").execute();
  await db.schema
    .alterTable("deck_check_keys")
    .addForeignKeyConstraint("deck_check_keys_group_fkey", ["group_id"], "friend_groups", ["id"])
    .onDelete("cascade")
    .execute();
  await db.schema
    .createIndex("idx_deck_check_keys_group")
    .on("deck_check_keys")
    .column("group_id")
    .execute();

  // ── 1. Restore the entry identity/claim columns + event_id ────────────────
  await db.schema
    .alterTable("deck_check_entries")
    .addColumn("event_id", "uuid")
    .addColumn("player_name", "text")
    .addColumn("player_email", "text")
    .addColumn("riot_id", "text")
    .addColumn("claimed_user_id", "text")
    .addColumn("claim_source", "text")
    .addColumn("claim_token", "text")
    .addColumn("claimed_at", "timestamptz")
    .addColumn("claim_blocked_at", "timestamptz")
    .execute();
  await db.schema
    .alterTable("deck_check_entries")
    .addCheckConstraint(
      "chk_deck_check_entries_player_name",
      sql`length(player_name) BETWEEN 1 AND 120`,
    )
    .execute();
  await db.schema
    .alterTable("deck_check_entries")
    .addCheckConstraint(
      "chk_deck_check_entries_player_email",
      sql`player_email IS NULL OR length(player_email) <= 254`,
    )
    .execute();
  await db.schema
    .alterTable("deck_check_entries")
    .addCheckConstraint(
      "chk_deck_check_entries_riot_id",
      sql`riot_id IS NULL OR length(riot_id) <= 120`,
    )
    .execute();
  await db.schema
    .alterTable("deck_check_entries")
    .addCheckConstraint(
      "chk_deck_check_entries_claim_source",
      sql`claim_source IS NULL OR claim_source IN ('email_auto', 'judge_manual', 'self_submit', 'claim_link')`,
    )
    .execute();
  await db.schema
    .alterTable("deck_check_entries")
    .addUniqueConstraint("deck_check_entries_claim_token_key", ["claim_token"])
    .execute();
  await db.schema
    .alterTable("deck_check_entries")
    .addForeignKeyConstraint("deck_check_entries_event_fkey", ["event_id"], "deck_check_events", [
      "id",
    ])
    .onDelete("cascade")
    .execute();
  await db.schema
    .alterTable("deck_check_entries")
    .addForeignKeyConstraint("deck_check_entries_claimed_user_fkey", ["claimed_user_id"], "users", [
      "id",
    ])
    .onDelete("set null")
    .execute();
  await db.schema
    .createIndex("idx_deck_check_entries_event")
    .on("deck_check_entries")
    .column("event_id")
    .execute();
  await db.schema
    .createIndex("idx_deck_check_entries_claimed_user")
    .on("deck_check_entries")
    .column("claimed_user_id")
    .execute();
  await sql`CREATE INDEX idx_deck_check_entries_player_email ON deck_check_entries (lower(player_email))`.execute(
    db,
  );
  await db.schema
    .alterTable("deck_check_entries")
    .dropConstraint("uq_deck_check_entries_tournament_external")
    .execute();
  await db.schema
    .alterTable("deck_check_entries")
    .addUniqueConstraint("uq_deck_check_entries_event_external", ["event_id", "external_id"])
    .execute();
  await sql`ALTER TABLE deck_check_entries ALTER COLUMN tournament_id DROP NOT NULL`.execute(db);
}

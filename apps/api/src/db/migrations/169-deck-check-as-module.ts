import type { Kysely } from "kysely";
import { sql } from "kysely";

// ADR-033 Phase 3a (additive) — absorb deck check into the tournaments umbrella.
// Every deck_check_events row becomes a format='none' tournament (reusing the
// event uuid as the tournament id), each entry's identity + claim columns move
// onto a tournament_participants row, group judges become tournament_staff, and
// the integration keys re-parent to the host. This migration only ADDS and
// BACKFILLS; the destructive drops (event_id, the moved entry columns,
// deck_check_events, the friend-group judge role) land in 170 so an early
// rollback never loses data.
export async function up(db: Kysely<unknown>): Promise<void> {
  // ── 1. New parent links on entries; host columns on keys ──────────────────
  await db.schema
    .alterTable("deck_check_entries")
    .addColumn("tournament_id", "uuid")
    .addColumn("participant_id", "uuid")
    .execute();
  await db.schema
    .alterTable("deck_check_entries")
    .addForeignKeyConstraint(
      "deck_check_entries_tournament_fkey",
      ["tournament_id"],
      "tournaments",
      ["id"],
    )
    .onDelete("cascade")
    .execute();
  await db.schema
    .alterTable("deck_check_entries")
    .addForeignKeyConstraint(
      "deck_check_entries_participant_fkey",
      ["participant_id"],
      "tournament_participants",
      ["id"],
    )
    .onDelete("set null")
    .execute();

  await db.schema
    .alterTable("deck_check_keys")
    .addColumn("host_type", "text")
    .addColumn("host_user_id", "text")
    .addColumn("host_org_id", "uuid")
    .execute();

  // ── 2. deck_check_events → tournaments (reuse the event uuid as the id) ────
  // host = the group's owner; format='none' (deck-check-only), deck-check on,
  // deck_submission='optional' (every migrated event already has decks).
  await sql`
    INSERT INTO tournaments (
      id, host_type, host_user_id, group_id, name, status, starts_at,
      format, pairing_style, deck_submission, deck_check_enabled, deck_phase,
      submissions_close_at, list_lock_mode, deck_format, allowed_sets,
      self_registration, submission_token, created_at, updated_at
    )
    SELECT
      e.id, 'user',
      (SELECT m.user_id FROM friend_group_members m
        WHERE m.group_id = e.group_id AND m.role = 'owner'
        ORDER BY m.user_id LIMIT 1),
      e.group_id, e.name,
      CASE e.status WHEN 'archived' THEN 'completed' ELSE 'running' END,
      e.event_date::timestamptz,
      'none', 'none', 'optional', true,
      CASE
        WHEN e.status = 'archived' THEN 'locked'
        WHEN e.submissions_close_at IS NOT NULL AND e.submissions_close_at < now() THEN 'closed'
        ELSE 'open'
      END,
      e.submissions_close_at, e.list_lock_mode, e.format, e.allowed_sets,
      e.allow_self_submission, e.submission_token, e.created_at, e.updated_at
    FROM deck_check_events e
  `.execute(db);

  // ── 3. Tournament staff: group owner → organizer, group judges → judge ────
  await sql`
    INSERT INTO tournament_staff (tournament_id, user_id, role)
    SELECT t.id, t.host_user_id, 'organizer'
    FROM tournaments t
    WHERE t.id IN (SELECT id FROM deck_check_events) AND t.host_user_id IS NOT NULL
    ON CONFLICT DO NOTHING
  `.execute(db);
  await sql`
    INSERT INTO tournament_staff (tournament_id, user_id, role)
    SELECT e.id, m.user_id, 'judge'
    FROM deck_check_events e
    JOIN friend_group_members m ON m.group_id = e.group_id AND m.role = 'judge'
    ON CONFLICT DO NOTHING
  `.execute(db);

  // ── 4. Entries → participants (duplicate-safe: one participant per linked
  // account holds all that account's entries; each unclaimed entry is its own
  // walk-in). A PL/pgSQL block keeps the entry→participant correlation exact. ─
  await sql`
    DO $$
    DECLARE
      grp RECORD;
      ent RECORD;
      pid uuid;
    BEGIN
      -- Linked accounts: one participant per (tournament, user), all entries attached.
      -- Status is seeded from the deck-check state: a participant is 'dropped'
      -- only when every one of their entries was withdrawn; any live entry keeps
      -- them 'active'. (This is a one-time seed; the two dimensions are
      -- independent at runtime — withdrawing a list later does not drop a player.)
      FOR grp IN
        SELECT event_id, claimed_user_id,
               (array_agg(id ORDER BY created_at))[1] AS first_entry_id,
               bool_and(state = 'withdrawn') AS all_withdrawn
        FROM deck_check_entries
        WHERE claimed_user_id IS NOT NULL
        GROUP BY event_id, claimed_user_id
      LOOP
        SELECT * INTO ent FROM deck_check_entries WHERE id = grp.first_entry_id;
        INSERT INTO tournament_participants (
          tournament_id, user_id, display_name, email, riot_id, status,
          claim_source, claim_token, claimed_at, claim_blocked_at, created_at, updated_at
        ) VALUES (
          ent.event_id, ent.claimed_user_id, ent.player_name, ent.player_email,
          ent.riot_id, CASE WHEN grp.all_withdrawn THEN 'dropped' ELSE 'active' END,
          ent.claim_source, ent.claim_token, ent.claimed_at,
          ent.claim_blocked_at, ent.created_at, ent.updated_at
        ) RETURNING id INTO pid;
        UPDATE deck_check_entries
          SET participant_id = pid, tournament_id = event_id
          WHERE event_id = grp.event_id AND claimed_user_id = grp.claimed_user_id;
      END LOOP;

      -- Walk-ins: one participant per unclaimed entry. A withdrawn entry seeds a
      -- 'dropped' participant; everything else is 'active'.
      FOR ent IN
        SELECT * FROM deck_check_entries WHERE claimed_user_id IS NULL ORDER BY created_at
      LOOP
        INSERT INTO tournament_participants (
          tournament_id, display_name, email, riot_id, status,
          claim_source, claim_token, claimed_at, claim_blocked_at, created_at, updated_at
        ) VALUES (
          ent.event_id, ent.player_name, ent.player_email, ent.riot_id,
          CASE WHEN ent.state = 'withdrawn' THEN 'dropped' ELSE 'active' END,
          ent.claim_source, ent.claim_token, ent.claimed_at, ent.claim_blocked_at,
          ent.created_at, ent.updated_at
        ) RETURNING id INTO pid;
        UPDATE deck_check_entries SET participant_id = pid, tournament_id = ent.event_id
          WHERE id = ent.id;
      END LOOP;
    END $$;
  `.execute(db);

  // ── 5. Re-parent integration keys to the host (group owner). ──────────────
  await sql`
    UPDATE deck_check_keys k
    SET host_type = 'user',
        host_user_id = (SELECT m.user_id FROM friend_group_members m
                         WHERE m.group_id = k.group_id AND m.role = 'owner'
                         ORDER BY m.user_id LIMIT 1)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Remove backfilled rows derived from events (no-op on a fresh/empty DB).
  await sql`
    DELETE FROM tournament_participants
    WHERE tournament_id IN (SELECT id FROM deck_check_events)
  `.execute(db);
  await sql`
    DELETE FROM tournament_staff
    WHERE tournament_id IN (SELECT id FROM deck_check_events)
  `.execute(db);
  await sql`DELETE FROM tournaments WHERE id IN (SELECT id FROM deck_check_events)`.execute(db);

  await db.schema.alterTable("deck_check_keys").dropColumn("host_org_id").execute();
  await db.schema.alterTable("deck_check_keys").dropColumn("host_user_id").execute();
  await db.schema.alterTable("deck_check_keys").dropColumn("host_type").execute();

  await db.schema
    .alterTable("deck_check_entries")
    .dropConstraint("deck_check_entries_participant_fkey")
    .execute();
  await db.schema
    .alterTable("deck_check_entries")
    .dropConstraint("deck_check_entries_tournament_fkey")
    .execute();
  await db.schema
    .alterTable("deck_check_entries")
    .dropColumn("participant_id")
    .dropColumn("tournament_id")
    .execute();
}

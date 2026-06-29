import type { Kysely } from "kysely";
import { sql } from "kysely";

// ADR-033 Phase 2 — the unified participant. Renames ADR-022's `pod_players` to
// `tournament_participants` and lifts the deck-check identity + claim machinery
// onto it, so one row spans walk-in name → invited/claimable email → linked
// account. Existing pod players backfill as walk-ins (display name only, no
// account link), so the pairing engine produces byte-identical pairings.
//
// The pod child FKs (pod_members.player_id, pod_byes.player_id) re-point at the
// renamed table automatically; their column names and shapes are unchanged.
export async function up(db: Kysely<unknown>): Promise<void> {
  // ── 1. Rename the table and carry constraint/index names forward ──────────
  await sql`ALTER TABLE pod_players RENAME TO tournament_participants`.execute(db);
  await sql`ALTER TABLE tournament_participants RENAME CONSTRAINT pod_players_pkey TO tournament_participants_pkey`.execute(
    db,
  );
  await sql`ALTER TABLE tournament_participants RENAME CONSTRAINT pod_players_tournament_fkey TO tournament_participants_tournament_fkey`.execute(
    db,
  );
  await sql`ALTER INDEX idx_pod_players_tournament RENAME TO idx_tournament_participants_tournament`.execute(
    db,
  );

  // Widen the display-name bound (1..80 → 1..120) to match deck-check player
  // names absorbed in Phase 3, and broaden status to the participant lifecycle.
  await sql`ALTER TABLE tournament_participants DROP CONSTRAINT chk_pod_players_name`.execute(db);
  await sql`ALTER TABLE tournament_participants DROP CONSTRAINT chk_pod_players_status`.execute(db);
  await db.schema
    .alterTable("tournament_participants")
    .addCheckConstraint(
      "chk_tournament_participants_name",
      sql`length(display_name) BETWEEN 1 AND 120`,
    )
    .execute();
  await db.schema
    .alterTable("tournament_participants")
    .addCheckConstraint(
      "chk_tournament_participants_status",
      sql`status IN ('requested', 'invited', 'active', 'dropped', 'no_show')`,
    )
    .execute();

  // ── 2. Identity + claim columns (lifted from deck_check_entries) ──────────
  await db.schema
    .alterTable("tournament_participants")
    .addColumn("user_id", "text")
    .addColumn("email", "text")
    .addColumn("riot_id", "text")
    .addColumn("seed", "integer")
    .addColumn("claim_source", "text")
    .addColumn("claim_token", "text")
    .addColumn("claimed_at", "timestamptz")
    .addColumn("claim_blocked_at", "timestamptz")
    .execute();

  await db.schema
    .alterTable("tournament_participants")
    .addCheckConstraint(
      "chk_tournament_participants_email",
      sql`email IS NULL OR length(email) <= 254`,
    )
    .execute();
  await db.schema
    .alterTable("tournament_participants")
    .addCheckConstraint(
      "chk_tournament_participants_riot_id",
      sql`riot_id IS NULL OR length(riot_id) <= 120`,
    )
    .execute();
  await db.schema
    .alterTable("tournament_participants")
    .addCheckConstraint(
      "chk_tournament_participants_claim_source",
      sql`claim_source IS NULL OR claim_source IN ('email_auto', 'judge_manual', 'self_submit', 'claim_link')`,
    )
    .execute();

  await db.schema
    .alterTable("tournament_participants")
    .addForeignKeyConstraint("tournament_participants_user_fkey", ["user_id"], "users", ["id"])
    .onDelete("set null")
    .execute();

  // ── 3. One participant per linked account; claim tokens resolve uniquely ──
  await sql`CREATE UNIQUE INDEX uq_tournament_participants_user ON tournament_participants (tournament_id, user_id) WHERE user_id IS NOT NULL`.execute(
    db,
  );
  await sql`CREATE UNIQUE INDEX uq_tournament_participants_claim_token ON tournament_participants (claim_token) WHERE claim_token IS NOT NULL`.execute(
    db,
  );
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX uq_tournament_participants_claim_token`.execute(db);
  await sql`DROP INDEX uq_tournament_participants_user`.execute(db);

  await db.schema
    .alterTable("tournament_participants")
    .dropConstraint("tournament_participants_user_fkey")
    .execute();
  await db.schema
    .alterTable("tournament_participants")
    .dropConstraint("chk_tournament_participants_claim_source")
    .execute();
  await db.schema
    .alterTable("tournament_participants")
    .dropConstraint("chk_tournament_participants_riot_id")
    .execute();
  await db.schema
    .alterTable("tournament_participants")
    .dropConstraint("chk_tournament_participants_email")
    .execute();

  await db.schema
    .alterTable("tournament_participants")
    .dropColumn("claim_blocked_at")
    .dropColumn("claimed_at")
    .dropColumn("claim_token")
    .dropColumn("claim_source")
    .dropColumn("seed")
    .dropColumn("riot_id")
    .dropColumn("email")
    .dropColumn("user_id")
    .execute();

  // Restore the narrower name + status CHECKs (Phase 2 produced no new states).
  await db.schema
    .alterTable("tournament_participants")
    .dropConstraint("chk_tournament_participants_status")
    .execute();
  await db.schema
    .alterTable("tournament_participants")
    .dropConstraint("chk_tournament_participants_name")
    .execute();
  await sql`
    ALTER TABLE tournament_participants
      ADD CONSTRAINT chk_pod_players_status CHECK (status IN ('active', 'dropped'))
  `.execute(db);
  await sql`
    ALTER TABLE tournament_participants
      ADD CONSTRAINT chk_pod_players_name CHECK (length(display_name) BETWEEN 1 AND 80)
  `.execute(db);

  await sql`ALTER INDEX idx_tournament_participants_tournament RENAME TO idx_pod_players_tournament`.execute(
    db,
  );
  await sql`ALTER TABLE tournament_participants RENAME CONSTRAINT tournament_participants_tournament_fkey TO pod_players_tournament_fkey`.execute(
    db,
  );
  await sql`ALTER TABLE tournament_participants RENAME CONSTRAINT tournament_participants_pkey TO pod_players_pkey`.execute(
    db,
  );
  await sql`ALTER TABLE tournament_participants RENAME TO pod_players`.execute(db);
}

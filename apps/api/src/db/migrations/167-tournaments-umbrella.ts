import type { Kysely } from "kysely";
import { sql } from "kysely";

// ADR-033 Phase 1 — the tournaments umbrella. Renames ADR-022's
// `pod_tournaments` to `tournaments` and extends it so one entity can compose
// any subset of {a pairing engine, deck submission, deck check, judges} under
// either a personal or an organizational host, optionally linked to a friend
// group. This phase is purely additive for the running pod engine: existing
// rows backfill as `host_type='user'` (host = the old owner), `format='pod_rounds'`,
// every module off, so the pod runner behaves exactly as before.
//
// The pod child tables (pod_rounds, pods, pod_members, pod_byes) keep their
// shape; their FKs now point at the renamed parent automatically.
export async function up(db: Kysely<unknown>): Promise<void> {
  // ── 1. Rename the table and the owner → host column ───────────────────────
  await sql`ALTER TABLE pod_tournaments RENAME TO tournaments`.execute(db);
  await sql`ALTER TABLE tournaments RENAME COLUMN owner_user_id TO host_user_id`.execute(db);
  // Org-hosted tournaments carry no host_user_id; the host CHECK enforces it
  // per-row instead of the blanket NOT NULL the old owner column had.
  await sql`ALTER TABLE tournaments ALTER COLUMN host_user_id DROP NOT NULL`.execute(db);

  // Carry the old constraint/index names forward to the new prefix so the
  // schema dump stays self-consistent.
  await sql`ALTER TABLE tournaments RENAME CONSTRAINT pod_tournaments_pkey TO tournaments_pkey`.execute(
    db,
  );
  await sql`ALTER TABLE tournaments RENAME CONSTRAINT pod_tournaments_owner_fkey TO tournaments_host_user_fkey`.execute(
    db,
  );
  await sql`ALTER TABLE tournaments RENAME CONSTRAINT chk_pod_tournaments_bye_points TO chk_tournaments_bye_points`.execute(
    db,
  );
  await sql`ALTER TABLE tournaments RENAME CONSTRAINT chk_pod_tournaments_name TO chk_tournaments_name`.execute(
    db,
  );
  await sql`ALTER TABLE tournaments RENAME CONSTRAINT chk_pod_tournaments_scheme TO chk_tournaments_scheme`.execute(
    db,
  );
  await sql`ALTER TABLE tournaments RENAME CONSTRAINT chk_pod_tournaments_status TO chk_tournaments_status`.execute(
    db,
  );
  await sql`ALTER INDEX uq_pod_tournaments_report_token RENAME TO uq_tournaments_report_token`.execute(
    db,
  );
  await sql`DROP INDEX idx_pod_tournaments_owner`.execute(db);

  // ── 2. New host / association / module / deck-phase / token columns ────────
  await db.schema
    .alterTable("tournaments")
    // Host: exactly one of user / organization (the CHECK below). Added with a
    // default so existing pod rows backfill as user-hosted; default dropped after.
    .addColumn("host_type", "text", (col) => col.defaultTo("user").notNull())
    .addColumn("host_org_id", "uuid")
    .addColumn("group_id", "uuid")
    .addColumn("starts_at", "timestamptz")
    // Format + pairing. 'none' = deck-check-only (no rounds). Only these values
    // ship now; the columns exist so Swiss / cut / 1v1 are additive later.
    .addColumn("format", "text", (col) => col.defaultTo("pod_rounds").notNull())
    .addColumn("pairing_style", "text", (col) => col.defaultTo("pod").notNull())
    // Deck-submission module (always produces a full deck-check entry).
    .addColumn("deck_submission", "text", (col) => col.defaultTo("none").notNull())
    .addColumn("deck_check_enabled", "boolean", (col) => col.defaultTo(false).notNull())
    // Deck phase, orthogonal to status; drives submissions, not pairing.
    .addColumn("deck_phase", "text", (col) => col.defaultTo("open").notNull())
    .addColumn("submissions_close_at", "timestamptz")
    .addColumn("list_lock_mode", "text", (col) => col.defaultTo("on_submit").notNull())
    // Deck-legality format (a deck_formats slug) — NOT the pairing `format`.
    .addColumn("deck_format", "text")
    .addColumn("allowed_sets", "jsonb")
    .addColumn("self_registration", "boolean", (col) => col.defaultTo(false).notNull())
    .addColumn("submission_token", "text")
    .execute();

  // ── 3. CHECK constraints (existing rows already satisfy them) ──────────────
  // Kysely's alterTable cannot chain multiple constraint ops in one statement.
  const addCheck = (name: string, check: ReturnType<typeof sql>): Promise<unknown> =>
    db.schema.alterTable("tournaments").addCheckConstraint(name, check).execute();

  await addCheck(
    "chk_tournaments_host",
    sql`(host_type = 'user'         AND host_user_id IS NOT NULL AND host_org_id IS NULL) OR
        (host_type = 'organization' AND host_org_id  IS NOT NULL AND host_user_id IS NULL)`,
  );
  await addCheck("chk_tournaments_format", sql`format IN ('none', 'pod_rounds')`);
  await addCheck("chk_tournaments_pairing_style", sql`pairing_style IN ('none', 'pod')`);
  await addCheck(
    "chk_tournaments_format_pairing",
    sql`(format = 'none'       AND pairing_style = 'none') OR
        (format = 'pod_rounds' AND pairing_style = 'pod')`,
  );
  await addCheck(
    "chk_tournaments_deck_submission",
    sql`deck_submission IN ('none', 'optional', 'required')`,
  );
  await addCheck(
    "chk_tournaments_deck_check",
    sql`NOT deck_check_enabled OR deck_submission <> 'none'`,
  );
  await addCheck("chk_tournaments_nonempty", sql`format <> 'none' OR deck_submission <> 'none'`);
  await addCheck("chk_tournaments_deck_phase", sql`deck_phase IN ('open', 'closed', 'locked')`);
  await addCheck(
    "chk_tournaments_list_lock_mode",
    sql`list_lock_mode IN ('on_submit', 'at_deadline')`,
  );

  // ── 4. Foreign keys for the new references ─────────────────────────────────
  await db.schema
    .alterTable("tournaments")
    .addForeignKeyConstraint("tournaments_host_org_fkey", ["host_org_id"], "organizations", ["id"])
    .onDelete("cascade")
    .execute();
  await db.schema
    .alterTable("tournaments")
    .addForeignKeyConstraint("tournaments_group_fkey", ["group_id"], "friend_groups", ["id"])
    .onDelete("set null")
    .execute();
  await db.schema
    .alterTable("tournaments")
    .addForeignKeyConstraint("tournaments_deck_format_fkey", ["deck_format"], "deck_formats", [
      "slug",
    ])
    .execute();

  // ── 5. Indexes ─────────────────────────────────────────────────────────────
  await sql`CREATE INDEX idx_tournaments_host_user ON tournaments (host_user_id) WHERE host_user_id IS NOT NULL`.execute(
    db,
  );
  await sql`CREATE INDEX idx_tournaments_host_org ON tournaments (host_org_id) WHERE host_org_id IS NOT NULL`.execute(
    db,
  );
  await sql`CREATE INDEX idx_tournaments_group ON tournaments (group_id) WHERE group_id IS NOT NULL`.execute(
    db,
  );
  await sql`CREATE UNIQUE INDEX uq_tournaments_submission_token ON tournaments (submission_token) WHERE submission_token IS NOT NULL`.execute(
    db,
  );

  // ── 6. Drop the host_type default now that existing rows are backfilled ────
  await sql`ALTER TABLE tournaments ALTER COLUMN host_type DROP DEFAULT`.execute(db);

  // ── 7. Per-tournament staff, decoupled from friend-group roles ────────────
  await db.schema
    .createTable("tournament_staff")
    .addColumn("tournament_id", "uuid", (col) => col.notNull())
    .addColumn("user_id", "text", (col) => col.notNull())
    .addColumn("role", "text", (col) => col.notNull())
    .addColumn("added_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addPrimaryKeyConstraint("tournament_staff_pkey", ["tournament_id", "user_id", "role"])
    .addCheckConstraint("chk_tournament_staff_role", sql`role IN ('organizer', 'judge')`)
    .execute();

  await db.schema
    .alterTable("tournament_staff")
    .addForeignKeyConstraint("tournament_staff_tournament_fkey", ["tournament_id"], "tournaments", [
      "id",
    ])
    .onDelete("cascade")
    .execute();
  await db.schema
    .alterTable("tournament_staff")
    .addForeignKeyConstraint("tournament_staff_user_fkey", ["user_id"], "users", ["id"])
    .onDelete("cascade")
    .execute();
  await db.schema
    .createIndex("idx_tournament_staff_user")
    .on("tournament_staff")
    .column("user_id")
    .execute();

  // ── 8. Seed each existing host as an organizer ─────────────────────────────
  await sql`
    INSERT INTO tournament_staff (tournament_id, user_id, role)
    SELECT id, host_user_id, 'organizer'
    FROM tournaments
    WHERE host_type = 'user' AND host_user_id IS NOT NULL
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("tournament_staff").execute();

  await sql`DROP INDEX uq_tournaments_submission_token`.execute(db);
  await sql`DROP INDEX idx_tournaments_group`.execute(db);
  await sql`DROP INDEX idx_tournaments_host_org`.execute(db);
  await sql`DROP INDEX idx_tournaments_host_user`.execute(db);

  const dropConstraint = (name: string): Promise<unknown> =>
    db.schema.alterTable("tournaments").dropConstraint(name).execute();

  await dropConstraint("tournaments_deck_format_fkey");
  await dropConstraint("tournaments_group_fkey");
  await dropConstraint("tournaments_host_org_fkey");
  await dropConstraint("chk_tournaments_list_lock_mode");
  await dropConstraint("chk_tournaments_deck_phase");
  await dropConstraint("chk_tournaments_nonempty");
  await dropConstraint("chk_tournaments_deck_check");
  await dropConstraint("chk_tournaments_deck_submission");
  await dropConstraint("chk_tournaments_format_pairing");
  await dropConstraint("chk_tournaments_pairing_style");
  await dropConstraint("chk_tournaments_format");
  await dropConstraint("chk_tournaments_host");

  await db.schema
    .alterTable("tournaments")
    .dropColumn("submission_token")
    .dropColumn("self_registration")
    .dropColumn("allowed_sets")
    .dropColumn("deck_format")
    .dropColumn("list_lock_mode")
    .dropColumn("submissions_close_at")
    .dropColumn("deck_phase")
    .dropColumn("deck_check_enabled")
    .dropColumn("deck_submission")
    .dropColumn("pairing_style")
    .dropColumn("format")
    .dropColumn("starts_at")
    .dropColumn("group_id")
    .dropColumn("host_org_id")
    .dropColumn("host_type")
    .execute();

  // Restore the owner column (only user-hosted rows existed before this phase).
  await sql`ALTER TABLE tournaments ALTER COLUMN host_user_id SET NOT NULL`.execute(db);
  await sql`ALTER TABLE tournaments RENAME COLUMN host_user_id TO owner_user_id`.execute(db);

  await sql`ALTER INDEX uq_tournaments_report_token RENAME TO uq_pod_tournaments_report_token`.execute(
    db,
  );
  await sql`ALTER TABLE tournaments RENAME CONSTRAINT chk_tournaments_status TO chk_pod_tournaments_status`.execute(
    db,
  );
  await sql`ALTER TABLE tournaments RENAME CONSTRAINT chk_tournaments_scheme TO chk_pod_tournaments_scheme`.execute(
    db,
  );
  await sql`ALTER TABLE tournaments RENAME CONSTRAINT chk_tournaments_name TO chk_pod_tournaments_name`.execute(
    db,
  );
  await sql`ALTER TABLE tournaments RENAME CONSTRAINT chk_tournaments_bye_points TO chk_pod_tournaments_bye_points`.execute(
    db,
  );
  await sql`ALTER TABLE tournaments RENAME CONSTRAINT tournaments_host_user_fkey TO pod_tournaments_owner_fkey`.execute(
    db,
  );
  await sql`ALTER TABLE tournaments RENAME CONSTRAINT tournaments_pkey TO pod_tournaments_pkey`.execute(
    db,
  );
  await sql`ALTER TABLE tournaments RENAME TO pod_tournaments`.execute(db);
  await sql`CREATE INDEX idx_pod_tournaments_owner ON pod_tournaments (owner_user_id)`.execute(db);
}

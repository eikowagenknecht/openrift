import type { Kysely } from "kysely";
import { sql } from "kysely";

// FFA pod-tournament runner (ADR-022). Five tables under the `pod_` prefix so
// they never collide with ADR-014's tournaments / tournaments_decks. The web
// URL says /tournaments/run; the tables say pod_; that mismatch is intentional.
//
// Lean model (decided in implementation, deviating from the ADR's first draft):
// pod_players carries NO aggregate columns and there is NO pod_opponents table.
// Score, pod tallies, rounds played, and opponent counts are derived on read
// from the finalized rounds — the result rows (pod_members.placement) are the
// single source of truth. The only stored derived values are the engine's
// write-once penalty outputs (pod_rounds.penalty_total, pods.penalty_breakdown),
// which a randomized search cannot reproduce. Penalties use double precision so
// postgres.js returns a JS number (numeric would come back as a string).
export async function up(db: Kysely<unknown>): Promise<void> {
  // ── 1. pod_tournaments ─────────────────────────────────────────────────────
  await db.schema
    .createTable("pod_tournaments")
    .addColumn("id", "uuid", (col) => col.defaultTo(sql`uuidv7()`).primaryKey())
    .addColumn("owner_user_id", "text", (col) => col.notNull())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("status", "text", (col) => col.defaultTo("setup").notNull())
    .addColumn("current_round", "integer", (col) => col.defaultTo(0).notNull())
    .addColumn("scoring_scheme", "text", (col) => col.defaultTo("standard").notNull())
    .addColumn("report_token", "text")
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("updated_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addCheckConstraint("chk_pod_tournaments_name", sql`length(name) BETWEEN 1 AND 120`)
    .addCheckConstraint(
      "chk_pod_tournaments_status",
      sql`status IN ('setup', 'running', 'completed')`,
    )
    .addCheckConstraint(
      "chk_pod_tournaments_scheme",
      sql`scoring_scheme IN ('standard', 'three_pod_reduced')`,
    )
    .execute();

  await db.schema
    .alterTable("pod_tournaments")
    .addForeignKeyConstraint("pod_tournaments_owner_fkey", ["owner_user_id"], "users", ["id"])
    .onDelete("cascade")
    .execute();

  await db.schema
    .createIndex("idx_pod_tournaments_owner")
    .on("pod_tournaments")
    .column("owner_user_id")
    .execute();

  // Partial unique on report_token: nullable (link disabled) but two tournaments
  // sharing a non-null token would make the report route ambiguous.
  await sql`
    CREATE UNIQUE INDEX uq_pod_tournaments_report_token
      ON pod_tournaments (report_token) WHERE report_token IS NOT NULL
  `.execute(db);

  await sql`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON pod_tournaments
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `.execute(db);

  // ── 2. pod_players ─────────────────────────────────────────────────────────
  await db.schema
    .createTable("pod_players")
    .addColumn("id", "uuid", (col) => col.defaultTo(sql`uuidv7()`).primaryKey())
    .addColumn("tournament_id", "uuid", (col) => col.notNull())
    .addColumn("display_name", "text", (col) => col.notNull())
    .addColumn("status", "text", (col) => col.defaultTo("active").notNull())
    .addColumn("dropped_after_round", "integer")
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("updated_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addCheckConstraint("chk_pod_players_name", sql`length(display_name) BETWEEN 1 AND 80`)
    .addCheckConstraint("chk_pod_players_status", sql`status IN ('active', 'dropped')`)
    .execute();

  await db.schema
    .alterTable("pod_players")
    .addForeignKeyConstraint("pod_players_tournament_fkey", ["tournament_id"], "pod_tournaments", [
      "id",
    ])
    .onDelete("cascade")
    .execute();

  await db.schema
    .createIndex("idx_pod_players_tournament")
    .on("pod_players")
    .column("tournament_id")
    .execute();

  await sql`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON pod_players
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `.execute(db);

  // ── 3. pod_rounds ──────────────────────────────────────────────────────────
  await db.schema
    .createTable("pod_rounds")
    .addColumn("id", "uuid", (col) => col.defaultTo(sql`uuidv7()`).primaryKey())
    .addColumn("tournament_id", "uuid", (col) => col.notNull())
    .addColumn("round_number", "integer", (col) => col.notNull())
    .addColumn("status", "text", (col) => col.defaultTo("reporting").notNull())
    .addColumn("penalty_total", "double precision", (col) => col.notNull())
    .addColumn("pairing_strategy", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("finalized_at", "timestamptz")
    .addCheckConstraint("chk_pod_rounds_number", sql`round_number > 0`)
    .addCheckConstraint("chk_pod_rounds_status", sql`status IN ('reporting', 'finalized')`)
    .addUniqueConstraint("uq_pod_rounds_number", ["tournament_id", "round_number"])
    .execute();

  await db.schema
    .alterTable("pod_rounds")
    .addForeignKeyConstraint("pod_rounds_tournament_fkey", ["tournament_id"], "pod_tournaments", [
      "id",
    ])
    .onDelete("cascade")
    .execute();

  await db.schema
    .createIndex("idx_pod_rounds_tournament")
    .on("pod_rounds")
    .column("tournament_id")
    .execute();

  // ── 4. pods ────────────────────────────────────────────────────────────────
  await db.schema
    .createTable("pods")
    .addColumn("id", "uuid", (col) => col.defaultTo(sql`uuidv7()`).primaryKey())
    .addColumn("round_id", "uuid", (col) => col.notNull())
    .addColumn("pod_number", "integer", (col) => col.notNull())
    .addColumn("size", "integer", (col) => col.notNull())
    .addColumn("penalty_breakdown", "jsonb", (col) => col.notNull())
    .addColumn("result_status", "text", (col) => col.defaultTo("pending").notNull())
    .addCheckConstraint("chk_pods_number", sql`pod_number > 0`)
    .addCheckConstraint("chk_pods_size", sql`size IN (3, 4)`)
    .addCheckConstraint("chk_pods_result_status", sql`result_status IN ('pending', 'reported')`)
    .addUniqueConstraint("uq_pods_number", ["round_id", "pod_number"])
    .execute();

  await db.schema
    .alterTable("pods")
    .addForeignKeyConstraint("pods_round_fkey", ["round_id"], "pod_rounds", ["id"])
    .onDelete("cascade")
    .execute();

  await db.schema.createIndex("idx_pods_round").on("pods").column("round_id").execute();

  // ── 5. pod_members ─────────────────────────────────────────────────────────
  await db.schema
    .createTable("pod_members")
    .addColumn("pod_id", "uuid", (col) => col.notNull())
    .addColumn("player_id", "uuid", (col) => col.notNull())
    .addColumn("placement", "integer")
    .addPrimaryKeyConstraint("pod_members_pkey", ["pod_id", "player_id"])
    .addCheckConstraint(
      "chk_pod_members_placement",
      sql`placement IS NULL OR (placement >= 1 AND placement <= 4)`,
    )
    .execute();

  await db.schema
    .alterTable("pod_members")
    .addForeignKeyConstraint("pod_members_pod_fkey", ["pod_id"], "pods", ["id"])
    .onDelete("cascade")
    .execute();

  await db.schema
    .alterTable("pod_members")
    .addForeignKeyConstraint("pod_members_player_fkey", ["player_id"], "pod_players", ["id"])
    .onDelete("cascade")
    .execute();

  await db.schema
    .createIndex("idx_pod_members_player")
    .on("pod_members")
    .column("player_id")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("pod_members").execute();
  await db.schema.dropTable("pods").execute();
  await db.schema.dropTable("pod_rounds").execute();
  await db.schema.dropTable("pod_players").execute();
  await db.schema.dropTable("pod_tournaments").execute();
}

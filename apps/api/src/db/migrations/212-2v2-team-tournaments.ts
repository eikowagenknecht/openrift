import type { Kysely } from "kysely";
import { sql } from "kysely";

// 2v2 team tournaments.
//
// `play_mode` is a second axis orthogonal to `pairing_style`: '2v2' composes
// with 'swiss' (team Swiss — each match is a size-4 pod holding two fixed
// teams) and with 'none' (a deck-only event checked against the 2v2 banlist).
// It is rejected with 'pod' and with the region layer; both combinations are
// CHECKed here and validated again in the service for readable errors.
//
// Teams are fixed pairs of participants: `tournament_teams` carries only the
// identity (display names derive from the two members), and membership lives
// on `tournament_participants.team_id`. Byes, results, and scores stay
// per-player — a team match stores the same game points and placement on both
// of a team's member rows, so standings and the pairing snapshot re-derive
// from the existing rows without team-level result tables. Dissolving a team
// deletes its row; SET NULL frees the members.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("tournaments")
    .addColumn("play_mode", "text", (col) => col.defaultTo("1v1").notNull())
    .execute();
  await db.schema
    .alterTable("tournaments")
    .addCheckConstraint("chk_tournaments_play_mode", sql`play_mode IN ('1v1', '2v2')`)
    .execute();
  await db.schema
    .alterTable("tournaments")
    .addCheckConstraint(
      "chk_tournaments_play_mode_pairing",
      sql`play_mode = '1v1' OR pairing_style <> 'pod'`,
    )
    .execute();
  await db.schema
    .alterTable("tournaments")
    .addCheckConstraint(
      "chk_tournaments_play_mode_regions",
      sql`play_mode = '1v1' OR regions_enabled = false`,
    )
    .execute();

  await db.schema
    .createTable("tournament_teams")
    .addColumn("id", "uuid", (col) => col.defaultTo(sql`uuidv7()`).primaryKey())
    .addColumn("tournament_id", "uuid", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addForeignKeyConstraint(
      "tournament_teams_tournament_fkey",
      ["tournament_id"],
      "tournaments",
      ["id"],
      (fk) => fk.onDelete("cascade"),
    )
    .execute();
  await db.schema
    .createIndex("idx_tournament_teams_tournament")
    .on("tournament_teams")
    .column("tournament_id")
    .execute();

  await db.schema.alterTable("tournament_participants").addColumn("team_id", "uuid").execute();
  await db.schema
    .alterTable("tournament_participants")
    .addForeignKeyConstraint(
      "tournament_participants_team_fkey",
      ["team_id"],
      "tournament_teams",
      ["id"],
      (fk) => fk.onDelete("set null"),
    )
    .execute();
  await db.schema
    .createIndex("idx_tournament_participants_team")
    .on("tournament_participants")
    .column("team_id")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("tournament_participants").dropColumn("team_id").execute();
  await db.schema.dropTable("tournament_teams").execute();
  await db.schema
    .alterTable("tournaments")
    .dropConstraint("chk_tournaments_play_mode_regions")
    .execute();
  await db.schema
    .alterTable("tournaments")
    .dropConstraint("chk_tournaments_play_mode_pairing")
    .execute();
  await db.schema.alterTable("tournaments").dropConstraint("chk_tournaments_play_mode").execute();
  await db.schema.alterTable("tournaments").dropColumn("play_mode").execute();
}

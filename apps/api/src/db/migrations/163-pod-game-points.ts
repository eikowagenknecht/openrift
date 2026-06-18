import type { Kysely } from "kysely";
import { sql } from "kysely";

// Points-based scoring for pod tournaments (ADR-022 follow-up).
//
// Organizers now enter each player's raw game points per pod (in Riftbound a
// game is won at 8 points; overshooting past 8 is possible) instead of picking
// placements. Placement is derived from the entered points (sorted high to low,
// equal points share a place) and still drives the scheme score; the raw game
// points are stored too and summed across rounds as the first standings
// tie-breaker after score.
//
//   - pod_members.game_points: the raw points a player ended a pod on. NULL
//     until the pod is reported; >= 0; can exceed 8.
//   - pod_tournaments.bye_points: how many score points a sat-out (bye) game is
//     worth. Replaces the old hard-coded win-equivalent 3. Existing tournaments
//     keep the previous behaviour (3); new tournaments default to 3 and the
//     organizer can set 0 (a sat-out player who dropped or was late scores
//     nothing) in the tournament settings.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("pod_members").addColumn("game_points", "integer").execute();

  await db.schema
    .alterTable("pod_members")
    .addCheckConstraint("chk_pod_members_game_points", sql`game_points IS NULL OR game_points >= 0`)
    .execute();

  await db.schema
    .alterTable("pod_tournaments")
    .addColumn("bye_points", "integer", (col) => col.defaultTo(3).notNull())
    .execute();

  await db.schema
    .alterTable("pod_tournaments")
    .addCheckConstraint("chk_pod_tournaments_bye_points", sql`bye_points >= 0`)
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("pod_tournaments")
    .dropConstraint("chk_pod_tournaments_bye_points")
    .execute();
  await db.schema.alterTable("pod_tournaments").dropColumn("bye_points").execute();
  await db.schema.alterTable("pod_members").dropConstraint("chk_pod_members_game_points").execute();
  await db.schema.alterTable("pod_members").dropColumn("game_points").execute();
}

import type { Kysely } from "kysely";

// FFA pod-tournament byes (ADR-022 follow-up). A bye records that a player sat a
// round out for win-equivalent points (a flat 3, derived on read — scheme
// independent, so no points column). Manual only: the organizer assigns byes to
// resolve an otherwise-unrepresentable field (1, 2, or 5 active players) or to
// sit out a departing player. Like every other result fact in this feature it is
// derived-on-read: a finalized bye folds into the player's score (+3), rounds
// played (+1), and bye count (drives the repeat-bye warning), with no opponent
// history and no 3/4-pod tally.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("pod_byes")
    .addColumn("round_id", "uuid", (col) => col.notNull())
    .addColumn("player_id", "uuid", (col) => col.notNull())
    .addPrimaryKeyConstraint("pod_byes_pkey", ["round_id", "player_id"])
    .execute();

  await db.schema
    .alterTable("pod_byes")
    .addForeignKeyConstraint("pod_byes_round_fkey", ["round_id"], "pod_rounds", ["id"])
    .onDelete("cascade")
    .execute();

  await db.schema
    .alterTable("pod_byes")
    .addForeignKeyConstraint("pod_byes_player_fkey", ["player_id"], "pod_players", ["id"])
    .onDelete("cascade")
    .execute();

  await db.schema.createIndex("idx_pod_byes_player").on("pod_byes").column("player_id").execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("pod_byes").execute();
}

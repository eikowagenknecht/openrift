import type { Kysely } from "kysely";
import { sql } from "kysely";

// Fixed seats for tournament participants (soft, by design): a participant can
// be pinned to a physical table number. The pairing engine never sees it — who
// plays whom is decided purely by pairing quality, and the fixed table only
// steers which table the pod lands on when the round is persisted. Two
// fixed-seat players may therefore be paired together; the lower table wins
// and the other player moves for that round.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("tournament_participants")
    .addColumn("fixed_table", "integer")
    .execute();
  await db.schema
    .alterTable("tournament_participants")
    .addCheckConstraint(
      "chk_tournament_participants_fixed_table",
      sql`fixed_table IS NULL OR fixed_table BETWEEN 1 AND 999`,
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("tournament_participants")
    .dropConstraint("chk_tournament_participants_fixed_table")
    .execute();
  await db.schema.alterTable("tournament_participants").dropColumn("fixed_table").execute();
}

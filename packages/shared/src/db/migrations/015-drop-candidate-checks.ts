import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // Candidates come from external sources and may have values outside the
  // game's known set (e.g. rarity "Promo", finish "Overnumbered"), so these
  // CHECK constraints are too restrictive.
  await db.schema
    .alterTable("candidate_printings")
    .dropConstraint("chk_candidate_printings_rarity")
    .ifExists()
    .execute();
  await db.schema
    .alterTable("candidate_printings")
    .dropConstraint("chk_candidate_printings_finish")
    .ifExists()
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("candidate_printings")
    .addCheckConstraint(
      "chk_candidate_printings_rarity",
      sql`rarity IN ('Common', 'Uncommon', 'Rare', 'Epic', 'Showcase')`,
    )
    .execute();
  await db.schema
    .alterTable("candidate_printings")
    .addCheckConstraint("chk_candidate_printings_finish", sql`finish IN ('normal', 'foil')`)
    .execute();
}

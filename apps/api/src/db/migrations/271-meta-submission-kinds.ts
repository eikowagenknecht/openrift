import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * What a contribution to the meta archive is asking for.
 *
 * Until now every submission was a decklist for a standings row that had none.
 * The archive also needs the two neighbouring asks — filling the gaps in a list
 * it already holds, and correcting one it holds wrongly — and those read
 * identically in the queue unless the row says which it is. `kind` is that word,
 * and `new_list` is what every existing row was.
 *
 * `event_correction` is the one kind that carries no decklist and no player: it
 * proposes changes to the event's own fields, so `player_name` becomes nullable
 * exactly for it and the proposed values live in `field_edits`.
 *
 * Rolling back keeps every row. An event correction has no player to restore,
 * so it is stamped with a placeholder name while the presence and length checks
 * are already dropped and before `NOT NULL` comes back. What is lost is the
 * proposed values and the word saying which ask it was, not somebody's message.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("meta_submissions")
    .addColumn("kind", "text", (col) => col.notNull().defaultTo("new_list"))
    .execute();
  await db.schema
    .alterTable("meta_submissions")
    .addCheckConstraint(
      "chk_meta_submissions_kind",
      sql`kind IN ('new_list', 'completion', 'correction', 'event_correction')`,
    )
    .execute();

  await db.schema.alterTable("meta_submissions").addColumn("field_edits", "jsonb").execute();
  await db.schema
    .alterTable("meta_submissions")
    .addCheckConstraint(
      "chk_meta_submissions_field_edits",
      sql`field_edits IS NULL OR jsonb_typeof(field_edits) = 'object'`,
    )
    .execute();
  await db.schema
    .alterTable("meta_submissions")
    .addCheckConstraint(
      "chk_meta_submissions_field_edits_kind",
      sql`field_edits IS NULL OR kind = 'event_correction'`,
    )
    .execute();

  await db.schema
    .alterTable("meta_submissions")
    .alterColumn("player_name", (col) => col.dropNotNull())
    .execute();
  await db.schema
    .alterTable("meta_submissions")
    .dropConstraint("chk_meta_submissions_player_name")
    .execute();
  await db.schema
    .alterTable("meta_submissions")
    .addCheckConstraint(
      "chk_meta_submissions_player_name",
      sql`player_name IS NULL OR (length(player_name) >= 1 AND length(player_name) <= 80)`,
    )
    .execute();
  await db.schema
    .alterTable("meta_submissions")
    .addCheckConstraint(
      "chk_meta_submissions_player_present",
      sql`(player_name IS NULL) = (kind = 'event_correction')`,
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("meta_submissions")
    .dropConstraint("chk_meta_submissions_player_present")
    .execute();
  await db.schema
    .alterTable("meta_submissions")
    .dropConstraint("chk_meta_submissions_player_name")
    .execute();

  // Both checks on the column are gone and NOT NULL is not back yet, which is
  // the one window where a correction's missing player can be filled in rather
  // than the row thrown away.
  await sql`
    UPDATE meta_submissions SET player_name = '(event correction)' WHERE player_name IS NULL
  `.execute(db);

  await db.schema
    .alterTable("meta_submissions")
    .alterColumn("player_name", (col) => col.setNotNull())
    .execute();
  await db.schema
    .alterTable("meta_submissions")
    .addCheckConstraint(
      "chk_meta_submissions_player_name",
      sql`length(player_name) >= 1 AND length(player_name) <= 80`,
    )
    .execute();

  await db.schema.alterTable("meta_submissions").dropColumn("field_edits").execute();
  await db.schema.alterTable("meta_submissions").dropColumn("kind").execute();
}

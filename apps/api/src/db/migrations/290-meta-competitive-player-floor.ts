import type { Kysely } from "kysely";
import { sql } from "kysely";

/** The field size that raises an event to `competitive`, hardcoded until now. */
const DEFAULT_FLOOR = 128;

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("meta_sync_settings")
    .addColumn("competitive_player_floor", "integer", (col) =>
      col.defaultTo(DEFAULT_FLOOR).notNull(),
    )
    .execute();

  await db.schema
    .alterTable("meta_sync_settings")
    .addCheckConstraint(
      "chk_meta_sync_settings_competitive_floor",
      sql`competitive_player_floor > 0`,
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("meta_sync_settings")
    .dropConstraint("chk_meta_sync_settings_competitive_floor")
    .execute();
  await db.schema.alterTable("meta_sync_settings").dropColumn("competitive_player_floor").execute();
}

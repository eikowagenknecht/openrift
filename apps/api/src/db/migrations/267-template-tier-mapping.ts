import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * The admin-curated tier per event template.
 *
 * Migration 266 introduced the event tier and classified it by name patterns,
 * which guess. The template is the product the organizer actually ran, its
 * vocabulary is a short finite list, and the templates table is already
 * admin-curated (`watched`), so the tier becomes one more mapping on it and the
 * name rules retreat to a suggestion in the mapping UI. NULL means the admin
 * has not mapped the template yet; events then fall back to a player-count
 * placeholder.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("uvsgames_event_templates").addColumn("tier", "text").execute();
  await db.schema
    .alterTable("uvsgames_event_templates")
    .addCheckConstraint(
      "chk_uvsgames_event_templates_tier",
      sql`tier IS NULL OR tier IN ('premier', 'competitive', 'store', 'casual')`,
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("uvsgames_event_templates").dropColumn("tier").execute();
}

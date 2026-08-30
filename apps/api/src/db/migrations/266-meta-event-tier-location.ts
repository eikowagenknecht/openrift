import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * Tier, country, and venue address on archived events.
 *
 * Every results site filters by how much an event counts for, and ours could
 * not: the live row kept nothing of the source's event template, name shape,
 * or venue. `tier` is the archive's own four-step vocabulary (premier /
 * competitive / store / casual), matched by rule at ingest and editable per
 * event. `country` is ISO 3166-1 alpha-2, parsed from the venue address.
 * `location` is that address as the source published it.
 *
 * The candidate table carries the same three columns nullable, so a source's
 * values ride the existing diff-and-accept machinery instead of a side
 * channel. On the live row `tier` is NOT NULL (the accept path always
 * classifies, falling back on the event's name) and defaults to `store`, the
 * tier that claims the least.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("meta_events")
    .addColumn("tier", "text", (col) => col.notNull().defaultTo("store"))
    .execute();
  await db.schema
    .alterTable("meta_events")
    .addCheckConstraint(
      "chk_meta_events_tier",
      sql`tier IN ('premier', 'competitive', 'store', 'casual')`,
    )
    .execute();

  await db.schema.alterTable("meta_events").addColumn("country", "text").execute();
  await db.schema
    .alterTable("meta_events")
    .addCheckConstraint("chk_meta_events_country", sql`country IS NULL OR country ~ '^[A-Z]{2}$'`)
    .execute();

  await db.schema.alterTable("meta_events").addColumn("location", "text").execute();
  await db.schema
    .alterTable("meta_events")
    .addCheckConstraint(
      "chk_meta_events_location",
      sql`location IS NULL OR (length(location) >= 1 AND length(location) <= 500)`,
    )
    .execute();

  await db.schema.alterTable("candidate_meta_events").addColumn("tier", "text").execute();
  await db.schema
    .alterTable("candidate_meta_events")
    .addCheckConstraint(
      "chk_candidate_meta_events_tier",
      sql`tier IS NULL OR tier IN ('premier', 'competitive', 'store', 'casual')`,
    )
    .execute();

  await db.schema.alterTable("candidate_meta_events").addColumn("country", "text").execute();
  await db.schema
    .alterTable("candidate_meta_events")
    .addCheckConstraint(
      "chk_candidate_meta_events_country",
      sql`country IS NULL OR country ~ '^[A-Z]{2}$'`,
    )
    .execute();

  await db.schema.alterTable("candidate_meta_events").addColumn("location", "text").execute();
  await db.schema
    .alterTable("candidate_meta_events")
    .addCheckConstraint(
      "chk_candidate_meta_events_location",
      sql`location IS NULL OR (length(location) >= 1 AND length(location) <= 500)`,
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("candidate_meta_events").dropColumn("location").execute();
  await db.schema.alterTable("candidate_meta_events").dropColumn("country").execute();
  await db.schema.alterTable("candidate_meta_events").dropColumn("tier").execute();
  await db.schema.alterTable("meta_events").dropColumn("location").execute();
  await db.schema.alterTable("meta_events").dropColumn("country").execute();
  await db.schema.alterTable("meta_events").dropColumn("tier").execute();
}

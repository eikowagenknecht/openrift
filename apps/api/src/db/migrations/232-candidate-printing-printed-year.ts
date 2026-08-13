import type { Kysely } from "kysely";
import { sql } from "kysely";

// The candidate-side counterpart of `printings.printed_year` (migration 119):
// the year stamped on the physical card, so provider uploads can carry it into
// the review grid instead of it only ever being typed by hand on accept.
//
// Nullable, no backfill — existing candidates simply have no value until their
// provider re-uploads. Unlike `printings`, no view projects
// `candidate_printings`, so there is nothing to drop and recreate here.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("candidate_printings")
    .addColumn("printed_year", sql`smallint`)
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("candidate_printings").dropColumn("printed_year").execute();
}

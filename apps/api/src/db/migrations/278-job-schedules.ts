import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("job_schedules")
    .addColumn("kind", "text", (col) => col.primaryKey())
    .addColumn("schedule", "text", (col) => col.notNull())
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .alterTable("job_schedules")
    .addCheckConstraint("chk_job_schedules_kind", sql`kind <> ''`)
    .execute();

  await db.schema
    .alterTable("job_schedules")
    .addCheckConstraint("chk_job_schedules_schedule", sql`schedule <> ''`)
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("job_schedules").execute();
}

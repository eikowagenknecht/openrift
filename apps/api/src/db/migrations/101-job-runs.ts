import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("job_runs")
    .addColumn("id", "uuid", (col) =>
      col
        .primaryKey()
        .defaultTo(sql`gen_random_uuid()`)
        .notNull(),
    )
    .addColumn("kind", "text", (col) => col.notNull())
    .addColumn("trigger", "text", (col) => col.notNull())
    .addColumn("status", "text", (col) => col.notNull())
    .addColumn("started_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("finished_at", "timestamptz")
    .addColumn("duration_ms", "integer")
    .addColumn("error_message", "text")
    .addColumn("result", "jsonb")
    .execute();

  await db.schema
    .alterTable("job_runs")
    .addCheckConstraint("chk_job_runs_status", sql`status IN ('running', 'succeeded', 'failed')`)
    .execute();

  await db.schema
    .alterTable("job_runs")
    .addCheckConstraint("chk_job_runs_trigger", sql`trigger IN ('cron', 'admin', 'api')`)
    .execute();

  await db.schema
    .createIndex("idx_job_runs_kind_started_at")
    .on("job_runs")
    .columns(["kind", "started_at desc"])
    .execute();

  await sql`
    CREATE INDEX idx_job_runs_running ON job_runs (kind) WHERE status = 'running'
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("job_runs").execute();
}

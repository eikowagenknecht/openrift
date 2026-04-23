import type { Kysely } from "kysely";
import { sql } from "kysely";

import type { Database, JobStatus, JobTrigger } from "../db/index.js";

export interface JobRun {
  id: string;
  kind: string;
  trigger: JobTrigger;
  status: JobStatus;
  startedAt: Date;
  finishedAt: Date | null;
  durationMs: number | null;
  errorMessage: string | null;
  result: unknown;
}

/**
 * Repository for tracking background job executions (cron + admin-triggered).
 *
 * @returns An object with job-run query/mutation methods bound to the given `db`.
 */
export function jobRunsRepo(db: Kysely<Database>) {
  return {
    /**
     * Insert a new run row in 'running' state.
     * @returns The id of the newly created row.
     */
    async start(params: { kind: string; trigger: JobTrigger }): Promise<{ id: string }> {
      const row = await db
        .insertInto("jobRuns")
        .values({ kind: params.kind, trigger: params.trigger, status: "running" })
        .returning("id")
        .executeTakeFirstOrThrow();
      return { id: row.id };
    },

    /**
     * Mark a run as succeeded with an optional JSON result summary.
     * @returns Resolves when the row has been updated.
     */
    async succeed(id: string, params: { durationMs: number; result?: unknown }): Promise<void> {
      await db
        .updateTable("jobRuns")
        .set({
          status: "succeeded",
          finishedAt: new Date(),
          durationMs: params.durationMs,
          result: params.result === undefined ? null : JSON.stringify(params.result),
        })
        .where("id", "=", id)
        .execute();
    },

    /**
     * Mark a run as failed with an error message.
     * @returns Resolves when the row has been updated.
     */
    async fail(id: string, params: { durationMs: number; errorMessage: string }): Promise<void> {
      await db
        .updateTable("jobRuns")
        .set({
          status: "failed",
          finishedAt: new Date(),
          durationMs: params.durationMs,
          errorMessage: params.errorMessage,
        })
        .where("id", "=", id)
        .execute();
    },

    /**
     * Find the currently-running row for a given kind, if any.
     * @returns The id of the running row, or null.
     */
    async findRunning(kind: string): Promise<{ id: string } | null> {
      const row = await db
        .selectFrom("jobRuns")
        .select("id")
        .where("kind", "=", kind)
        .where("status", "=", "running")
        .orderBy("startedAt", "desc")
        .limit(1)
        .executeTakeFirst();
      return row ?? null;
    },

    /**
     * List the most recent runs, optionally filtered by kind.
     * @returns Rows ordered by started_at descending.
     */
    listRecent(params: { kind?: string; limit?: number }): Promise<JobRun[]> {
      let q = db
        .selectFrom("jobRuns")
        .select([
          "id",
          "kind",
          "trigger",
          "status",
          "startedAt",
          "finishedAt",
          "durationMs",
          "errorMessage",
          "result",
        ])
        .orderBy("startedAt", "desc")
        .limit(params.limit ?? 20);
      if (params.kind !== undefined) {
        q = q.where("kind", "=", params.kind);
      }
      return q.execute() as Promise<JobRun[]>;
    },

    /**
     * For each kind seen in the table, return the latest run row.
     * Used by the admin status dashboard.
     * @returns A map from kind to its latest JobRun.
     */
    async getLatestPerKind(): Promise<Record<string, JobRun>> {
      const rows = await sql<JobRun>`
        SELECT DISTINCT ON (kind)
          id, kind, trigger, status, started_at AS "startedAt",
          finished_at AS "finishedAt", duration_ms AS "durationMs",
          error_message AS "errorMessage", result
        FROM job_runs
        ORDER BY kind, started_at DESC
      `.execute(db);
      const out: Record<string, JobRun> = {};
      for (const row of rows.rows) {
        out[row.kind] = row;
      }
      return out;
    },

    /**
     * Mark any rows left in 'running' state as 'failed'. Called on server
     * startup so rows orphaned by a crashed process don't block re-entrancy.
     * @returns The number of rows swept.
     */
    async sweepOrphaned(): Promise<number> {
      const result = await sql<{ count: string }>`
        WITH swept AS (
          UPDATE job_runs
          SET status = 'failed',
              finished_at = now(),
              duration_ms = (extract(epoch from (now() - started_at)) * 1000)::int,
              error_message = 'server restarted during run'
          WHERE status = 'running'
          RETURNING 1
        )
        SELECT count(*)::text AS count FROM swept
      `.execute(db);
      return Number(result.rows[0]?.count ?? 0);
    },

    /**
     * Delete rows older than the given cutoff date.
     * @returns The number of rows deleted.
     */
    async purgeOlderThan(cutoff: Date): Promise<number> {
      const result = await db
        .deleteFrom("jobRuns")
        .where("startedAt", "<", cutoff)
        .executeTakeFirst();
      return Number(result.numDeletedRows);
    },
  };
}

import type { JobStatus, JobTrigger } from "@openrift/shared/contracts/admin/job-runs";
import type { Kysely } from "kysely";
import { sql } from "kysely";

import type { Database } from "../db/index.js";
import { isUniqueViolationOn } from "../lib/pg-errors.js";

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
  /** Activity axis for a succeeded run: true = no work done, false = did work,
   *  null = unclassified (failures, unclassified jobs, pre-migration rows). */
  noop: boolean | null;
}

/** Both LIKE wildcards are ordinary characters in a job kind (`meta.uvsgames_`). */
function escapeLike(value: string): string {
  return value.replaceAll(/[\\%_]/gu, String.raw`\$&`);
}

export function jobRunsRepo(db: Kysely<Database>) {
  return {
    /**
     * The partial unique index on running rows allows at most one per kind;
     * a losing concurrent insert returns null and does not throw.
     */
    async start(params: { kind: string; trigger: JobTrigger }): Promise<{ id: string } | null> {
      try {
        const row = await db
          .insertInto("jobRuns")
          .values({ kind: params.kind, trigger: params.trigger, status: "running" })
          .returning("id")
          .executeTakeFirstOrThrow();
        return { id: row.id };
      } catch (error) {
        if (isUniqueViolationOn(error, "idx_job_runs_running")) {
          return null;
        }
        throw error;
      }
    },

    async succeed(
      id: string,
      params: { durationMs: number; result?: unknown; noop?: boolean | null },
    ): Promise<void> {
      await db
        .updateTable("jobRuns")
        .set({
          status: "succeeded",
          finishedAt: new Date(),
          durationMs: params.durationMs,
          result: params.result ?? null,
          noop: params.noop ?? null,
        })
        .where("id", "=", id)
        .execute();
    },

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

    async getResult(id: string): Promise<unknown> {
      const row = await db
        .selectFrom("jobRuns")
        .select("result")
        .where("id", "=", id)
        .executeTakeFirst();
      return row?.result ?? null;
    },

    async updateResult(id: string, result: unknown): Promise<void> {
      await db
        .updateTable("jobRuns")
        .set({ result: result ?? null })
        .where("id", "=", id)
        .execute();
    },

    /**
     * Merges a progress patch into the stored result, keeping the keys it does
     * not name. Two things depend on that: a long job whose phases each write
     * their own counters (a recheck's totals and the deck fetch's progress land
     * in one row), and a cancel request that arrives while the job is building
     * its next heartbeat, which a read-modify-write would drop. A
     * `cancelRequested` already on the row therefore survives a patch carrying
     * its own `false`.
     */
    async mergeResult(id: string, patch: object): Promise<void> {
      await db
        .updateTable("jobRuns")
        .set({
          result: sql`
            (coalesce(result, '{}'::jsonb) || ${patch}::jsonb)
            || case
                 when coalesce((result ->> 'cancelRequested')::boolean, false)
                 then '{"cancelRequested": true}'::jsonb
                 else '{}'::jsonb
               end`,
        })
        .where("id", "=", id)
        .execute();
    },

    /**
     * Asks a running job to stop, without reading its result first: the job
     * rewrites that column every heartbeat, so a read-modify-write here loses
     * the request whenever a beat lands between the two statements.
     */
    async requestCancel(id: string): Promise<void> {
      await db
        .updateTable("jobRuns")
        .set({ result: sql`coalesce(result, '{}'::jsonb) || '{"cancelRequested": true}'::jsonb` })
        .where("id", "=", id)
        .execute();
    },

    /**
     * Find the most recent run of a kind that has a stored checkpoint. Rows
     * with a null `result` are skipped so a failure that never wrote a
     * checkpoint doesn't shadow an earlier run's progress.
     */
    async findLatestForResume(kind: string): Promise<JobRun | null> {
      const row = await db
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
          "noop",
        ])
        .where("kind", "=", kind)
        .where("result", "is not", null)
        .orderBy("startedAt", "desc")
        .limit(1)
        .executeTakeFirst();
      return row ?? null;
    },

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
          "noop",
        ])
        .orderBy("startedAt", "desc")
        .limit(params.limit ?? 20);
      if (params.kind !== undefined) {
        q = q.where("kind", "=", params.kind);
      }
      return q.execute();
    },

    /**
     * Sort is tie-broken by id so the ordering is stable across pages when
     * rows share a started_at.
     */
    async listPage(params: {
      kind?: string;
      kindPrefix?: string;
      trigger?: JobTrigger;
      status?: JobStatus;
      /** Filter by activity: true = only no-ops, false = only runs that did
       *  work (excludes unclassified null rows), undefined = no filter. */
      noop?: boolean;
      limit: number;
      offset: number;
    }): Promise<{ rows: JobRun[]; total: number }> {
      let rowQuery = db
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
          "noop",
        ])
        .orderBy("startedAt", "desc")
        .orderBy("id", "desc")
        .limit(params.limit)
        .offset(params.offset);
      let countQuery = db
        .selectFrom("jobRuns")
        .select((eb) => eb.fn.countAll<string>().as("total"));
      if (params.kind !== undefined) {
        rowQuery = rowQuery.where("kind", "=", params.kind);
        countQuery = countQuery.where("kind", "=", params.kind);
      }
      if (params.kindPrefix !== undefined) {
        const pattern = `${escapeLike(params.kindPrefix)}%`;
        rowQuery = rowQuery.where("kind", "like", pattern);
        countQuery = countQuery.where("kind", "like", pattern);
      }
      if (params.trigger !== undefined) {
        rowQuery = rowQuery.where("trigger", "=", params.trigger);
        countQuery = countQuery.where("trigger", "=", params.trigger);
      }
      if (params.status !== undefined) {
        rowQuery = rowQuery.where("status", "=", params.status);
        countQuery = countQuery.where("status", "=", params.status);
      }
      if (params.noop !== undefined) {
        rowQuery = rowQuery.where("noop", "=", params.noop);
        countQuery = countQuery.where("noop", "=", params.noop);
      }
      const [rows, countRow] = await Promise.all([
        rowQuery.execute(),
        countQuery.executeTakeFirstOrThrow(),
      ]);
      return { rows, total: Number(countRow.total) };
    },

    listRecentByKinds(kinds: string[], limit: number): Promise<JobRun[]> {
      if (kinds.length === 0) {
        return Promise.resolve([]);
      }
      return db
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
          "noop",
        ])
        .where("kind", "in", kinds)
        .orderBy("startedAt", "desc")
        .limit(limit)
        .execute();
    },

    async listKinds(): Promise<string[]> {
      const rows = await db
        .selectFrom("jobRuns")
        .select("kind")
        .distinct()
        .orderBy("kind", "asc")
        .execute();
      return rows.map((row) => row.kind);
    },

    async getLatestPerKind(): Promise<Record<string, JobRun>> {
      const rows = await db
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
          "noop",
        ])
        .distinctOn("kind")
        .orderBy("kind")
        .orderBy("startedAt", "desc")
        .execute();
      const out: Record<string, JobRun> = {};
      for (const row of rows) {
        out[row.kind] = row;
      }
      return out;
    },

    /**
     * Mark any rows left in 'running' state as 'failed'. Must run on server
     * startup so rows orphaned by a crashed process don't block re-entrancy.
     */
    async sweepOrphaned(): Promise<number> {
      const result = await db
        .updateTable("jobRuns")
        .set({
          status: "failed",
          finishedAt: sql<Date>`now()`,
          // The run's own start time is the only clock we have for how long it
          // was up, so the duration is computed per row in SQL.
          durationMs: sql<number>`(extract(epoch from (now() - started_at)) * 1000)::int`,
          errorMessage: "server restarted during run",
        })
        .where("status", "=", "running")
        .executeTakeFirst();
      return Number(result.numUpdatedRows);
    },

    async purgeOlderThan(cutoff: Date): Promise<number> {
      const result = await db
        .deleteFrom("jobRuns")
        .where("startedAt", "<", cutoff)
        .executeTakeFirst();
      return Number(result.numDeletedRows);
    },
  };
}

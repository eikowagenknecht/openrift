import { ERROR_CODES } from "@openrift/shared";
import type {
  JobScheduleView,
  ScheduledJobKind,
} from "@openrift/shared/contracts/admin/job-schedules";
import type { Logger } from "@openrift/shared/logger";
import { Cron } from "croner";

import type { Repos } from "../deps.js";
import { AppError } from "../errors.js";
import type { JobScheduleMeta } from "../lib/job-schedule-presenters.js";
import { toJobScheduleView } from "../lib/job-schedule-presenters.js";
import { runJob, runJobAsync } from "./run-job.js";

export interface JobDefinition<T = unknown> extends JobScheduleMeta {
  /** Reason to skip this tick, or null to run. Cron ticks only; a manual run
   *  ignores it. */
  skipCronTick?: () => Promise<string | null>;
  execute: (runId: string) => Promise<T>;
  summarize?: (result: T) => unknown;
  classifyNoop?: (result: T) => boolean;
  log: Logger;
}

// oxlint-disable-next-line typescript/no-explicit-any -- the result type is per definition and `summarize`/`classifyNoop` make it invariant, so a list of mixed definitions cannot be typed on `unknown`
export type AnyJobDefinition = JobDefinition<any>;

/**
 * Erases a definition's result type so mixed definitions fit one array, while
 * still checking `summarize` and `classifyNoop` against what `execute` returns.
 */
export function defineJob<T>(definition: JobDefinition<T>): AnyJobDefinition {
  return definition;
}

export interface JobScheduler {
  start: () => Promise<void>;
  list: () => Promise<JobScheduleView[]>;
  set: (kind: ScheduledJobKind, schedule: string) => Promise<JobScheduleView>;
  disable: (kind: ScheduledJobKind) => Promise<JobScheduleView>;
  enableSuggested: () => Promise<JobScheduleView[]>;
  runNow: (
    kind: ScheduledJobKind,
  ) => Promise<{ runId: string; status: "running" | "already_running" }>;
  isEnabled: (kind: ScheduledJobKind) => boolean;
  stop: () => void;
}

interface JobSchedulerDeps {
  repos: Pick<Repos, "jobSchedules" | "jobRuns">;
  definitions: AnyJobDefinition[];
  log: Logger;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Owns the croner timers for the scheduled jobs and the `job_schedules` rows
 * that decide which of them exist. A job with no row does not run at all.
 */
export function createJobScheduler(deps: JobSchedulerDeps): JobScheduler {
  const { repos, definitions, log } = deps;
  const byKind = new Map(definitions.map((definition) => [definition.kind, definition]));
  const crons = new Map<ScheduledJobKind, Cron>();

  function requireDefinition(kind: ScheduledJobKind): AnyJobDefinition {
    const definition = byKind.get(kind);
    if (definition === undefined) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, `Unknown job "${kind}"`);
    }
    return definition;
  }

  function requireAvailable(kind: ScheduledJobKind): AnyJobDefinition {
    const definition = requireDefinition(kind);
    if (definition.unavailableReason !== undefined) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, definition.unavailableReason);
    }
    return definition;
  }

  async function tick(definition: AnyJobDefinition): Promise<void> {
    if (definition.skipCronTick) {
      const reason = await definition.skipCronTick();
      if (reason !== null) {
        definition.log.info({ kind: definition.kind }, reason);
        return;
      }
    }
    await runJob({ repos, log: definition.log }, definition.kind, "cron", definition.execute, {
      summarize: definition.summarize,
      classifyNoop: definition.classifyNoop,
    });
  }

  function register(definition: AnyJobDefinition, schedule: string): void {
    crons.get(definition.kind)?.stop();
    const cron = new Cron(schedule, { protect: true, timezone: "UTC" }, async () => {
      await tick(definition);
    });
    crons.set(definition.kind, cron);
  }

  function assertValidSchedule(schedule: string): void {
    try {
      new Cron(schedule, { paused: true }).stop();
    } catch (error) {
      throw new AppError(
        400,
        ERROR_CODES.BAD_REQUEST,
        `Invalid cron expression: ${messageOf(error)}`,
      );
    }
  }

  async function viewsFor(kinds: AnyJobDefinition[]): Promise<JobScheduleView[]> {
    const [rows, latestRuns] = await Promise.all([
      repos.jobSchedules.listAll(),
      repos.jobRuns.getLatestPerKind(),
    ]);
    const rowsByKind = new Map(rows.map((row) => [row.kind, row]));
    return kinds.map((definition) =>
      toJobScheduleView({
        meta: definition,
        row: rowsByKind.get(definition.kind) ?? null,
        lastRun: latestRuns[definition.kind],
        nextRun: crons.get(definition.kind)?.nextRun() ?? null,
      }),
    );
  }

  async function viewFor(definition: AnyJobDefinition): Promise<JobScheduleView> {
    const [view] = await viewsFor([definition]);
    return view;
  }

  async function set(kind: ScheduledJobKind, schedule: string): Promise<JobScheduleView> {
    const definition = requireAvailable(kind);
    const expression = schedule.trim();
    assertValidSchedule(expression);
    await repos.jobSchedules.upsert(kind, expression);
    register(definition, expression);
    definition.log.info({ kind, schedule: expression }, "Job schedule set");
    return await viewFor(definition);
  }

  return {
    async start() {
      const rows = await repos.jobSchedules.listAll();
      for (const row of rows) {
        const definition = byKind.get(row.kind as ScheduledJobKind);
        if (definition === undefined) {
          log.warn({ kind: row.kind }, "Stored schedule for an unknown job, ignoring");
          continue;
        }
        if (definition.unavailableReason !== undefined) {
          log.warn(
            { kind: row.kind, reason: definition.unavailableReason },
            "Job is unavailable, not registering its schedule",
          );
          continue;
        }
        try {
          register(definition, row.schedule);
          log.info({ kind: row.kind, schedule: row.schedule }, "Job registered");
        } catch (error) {
          log.warn(
            { err: error, kind: row.kind, schedule: row.schedule },
            "Invalid stored cron expression, job not registered",
          );
        }
      }
    },

    list() {
      return viewsFor(definitions);
    },

    set,

    async disable(kind) {
      const definition = requireDefinition(kind);
      await repos.jobSchedules.remove(kind);
      crons.get(kind)?.stop();
      crons.delete(kind);
      definition.log.info({ kind }, "Job schedule removed");
      return await viewFor(definition);
    },

    async enableSuggested() {
      const rows = await repos.jobSchedules.listAll();
      const stored = new Set(rows.map((row) => row.kind));
      for (const definition of definitions) {
        if (definition.unavailableReason !== undefined || stored.has(definition.kind)) {
          continue;
        }
        // oxlint-disable-next-line no-await-in-loop -- each write depends on the previous one having landed, and there are at most fourteen
        await set(definition.kind, definition.suggestedSchedule);
      }
      return await viewsFor(definitions);
    },

    async runNow(kind) {
      const definition = requireAvailable(kind);
      return await runJobAsync({ repos, log: definition.log }, kind, "admin", definition.execute, {
        summarize: definition.summarize,
        classifyNoop: definition.classifyNoop,
      });
    },

    isEnabled(kind) {
      return crons.has(kind);
    },

    stop() {
      for (const cron of crons.values()) {
        cron.stop();
      }
      crons.clear();
    },
  };
}

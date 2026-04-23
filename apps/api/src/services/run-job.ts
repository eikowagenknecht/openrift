import type { Logger } from "@openrift/shared/logger";

import type { JobTrigger } from "../db/index.js";
import type { Repos } from "../deps.js";

interface RunJobOptions<T> {
  /** If provided, its return value is stored as the run's `result` JSONB. */
  summarize?: (result: T) => unknown;
}

interface RunJobDeps {
  repos: Pick<Repos, "jobRuns">;
  log: Logger;
}

/**
 * Execute `fn` while tracking its lifecycle in the `job_runs` table.
 *
 * Awaits completion. On failure, logs the error and writes a failed row
 * rather than re-throwing — so cron handlers can call this without needing
 * their own try/catch to keep the timer alive. Callers that need to know
 * whether the work actually succeeded should check the return value: `T`
 * on success, `null` on failure or if a run was already in progress.
 *
 * @returns The value returned by `fn`, or `null` if the job already had a
 *   running row or if `fn` threw.
 */
export async function runJob<T>(
  deps: RunJobDeps,
  kind: string,
  trigger: JobTrigger,
  fn: () => Promise<T>,
  options?: RunJobOptions<T>,
): Promise<T | null> {
  const { repos, log } = deps;

  const existing = await repos.jobRuns.findRunning(kind);
  if (existing !== null) {
    log.warn({ kind, runId: existing.id }, "Job already running, skipping");
    return null;
  }

  const { id } = await repos.jobRuns.start({ kind, trigger });
  const startMs = Date.now();
  log.info({ kind, runId: id, trigger }, "Job started");

  try {
    const result = await fn();
    const durationMs = Date.now() - startMs;
    const summary = options?.summarize?.(result);
    await repos.jobRuns.succeed(id, { durationMs, result: summary });
    log.info({ kind, runId: id, durationMs }, "Job succeeded");
    return result;
  } catch (error) {
    const durationMs = Date.now() - startMs;
    const message = error instanceof Error ? error.message : String(error);
    await repos.jobRuns.fail(id, { durationMs, errorMessage: message });
    log.error({ err: error, kind, runId: id, durationMs }, "Job failed");
    return null;
  }
}

/**
 * Kick off `fn` in the background and return the new run's id immediately.
 * Use for admin endpoints that would otherwise time out behind a gateway
 * (Cloudflare 502) on long operations.
 *
 * If a run of the same `kind` is already `running`, returns the existing
 * runId with status `already_running` instead of starting a duplicate.
 *
 * @returns Object with `runId` and `status` indicating whether a new run was
 * started or an existing one was returned.
 */
export async function runJobAsync<T>(
  deps: RunJobDeps,
  kind: string,
  trigger: JobTrigger,
  fn: () => Promise<T>,
  options?: RunJobOptions<T>,
): Promise<{ runId: string; status: "running" | "already_running" }> {
  const { repos, log } = deps;

  const existing = await repos.jobRuns.findRunning(kind);
  if (existing !== null) {
    log.warn({ kind, runId: existing.id }, "Job already running, returning existing runId");
    return { runId: existing.id, status: "already_running" };
  }

  const { id } = await repos.jobRuns.start({ kind, trigger });
  const startMs = Date.now();
  log.info({ kind, runId: id, trigger }, "Job started (async)");

  // Fire-and-forget: schedule the work on the event loop and return the
  // runId immediately. Errors are captured into the row, never rethrown.
  setImmediate(() => {
    void (async () => {
      try {
        const result = await fn();
        const durationMs = Date.now() - startMs;
        const summary = options?.summarize?.(result);
        await repos.jobRuns.succeed(id, { durationMs, result: summary });
        log.info({ kind, runId: id, durationMs }, "Job succeeded (async)");
      } catch (error) {
        const durationMs = Date.now() - startMs;
        const message = error instanceof Error ? error.message : String(error);
        try {
          await repos.jobRuns.fail(id, { durationMs, errorMessage: message });
        } catch (writeError) {
          log.error({ err: writeError, kind, runId: id }, "Failed to write job_runs failure row");
        }
        log.error({ err: error, kind, runId: id, durationMs }, "Job failed (async)");
      }
    })();
  });

  return { runId: id, status: "running" };
}

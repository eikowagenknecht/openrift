import type { JobTrigger } from "@openrift/shared";
import type { Logger } from "@openrift/shared/logger";
import { context, SpanStatusCode, trace } from "@opentelemetry/api";
import * as Sentry from "@sentry/bun";

import type { Repos } from "../deps.js";

const tracer = trace.getTracer("openrift-api/jobs");

/**
 * How a tracked run ended. {@link runJob} collapses this to `T | null`;
 * {@link runJobOutcome} hands it back intact for callers that have to tell a
 * failure apart from a skipped run — an admin endpoint answering a click, say,
 * which would otherwise report both as success.
 */
export type JobOutcome<T> =
  | { status: "succeeded"; result: T }
  | { status: "failed"; message: string }
  | { status: "already_running"; runId: string };

/**
 * Report a job failure to Sentry.
 *
 * Jobs run outside the request path, so neither the Hono `onError` handler nor
 * the oRPC reporting interceptor ever sees them. Without this, a failed cron is
 * visible only in the `job_runs` table and the logs, and nothing pushes an
 * alert anywhere.
 *
 * @returns Nothing.
 */
function captureJobFailure(
  error: unknown,
  scope: { kind: string; trigger: JobTrigger; runId: string },
): void {
  Sentry.captureException(error, {
    tags: { source: "job", "job.kind": scope.kind, "job.trigger": scope.trigger },
    extra: { runId: scope.runId },
  });
}

interface RunJobOptions<T> {
  /** If provided, its return value is stored as the run's `result` JSONB. */
  summarize?: (result: T) => unknown;
  /** If provided, classifies a successful run's activity: `true` when the run
   *  found no work to do, `false` when it did work. Runs without a classifier
   *  (and all failures) leave `noop` null. Operates on the raw job result, not
   *  the summarized form. */
  classifyNoop?: (result: T) => boolean;
}

interface RunJobDeps {
  repos: Pick<Repos, "jobRuns">;
  log: Logger;
}

/**
 * Execute `fn` while tracking its lifecycle in the `job_runs` table.
 *
 * Awaits completion. On failure, logs the error, reports it to Sentry and
 * writes a failed row rather than re-throwing — so cron handlers can call this
 * without needing their own try/catch to keep the timer alive. Callers that
 * need to know whether the work actually succeeded should check the return
 * value: `T` on success, `null` on failure or if a run was already in progress.
 * Use {@link runJobOutcome} when those two must be told apart.
 *
 * @returns The value returned by `fn`, or `null` if the job already had a
 *   running row or if `fn` threw.
 */
export async function runJob<T>(
  deps: RunJobDeps,
  kind: string,
  trigger: JobTrigger,
  fn: (runId: string) => Promise<T>,
  options?: RunJobOptions<T>,
): Promise<T | null> {
  const outcome = await runJobOutcome(deps, kind, trigger, fn, options);
  return outcome.status === "succeeded" ? outcome.result : null;
}

/**
 * {@link runJob} without the `null` collapse: the same tracked run, reported as
 * a discriminated {@link JobOutcome}. Use it where "the job failed" and "a run
 * was already in flight" need different answers, e.g. an admin endpoint that
 * would otherwise return 200 for a failed run.
 *
 * @returns The run's outcome. A failing `fn` yields a `failed` outcome rather
 *   than a rejection; only a `job_runs` write that itself throws propagates.
 */
export function runJobOutcome<T>(
  deps: RunJobDeps,
  kind: string,
  trigger: JobTrigger,
  fn: (runId: string) => Promise<T>,
  options?: RunJobOptions<T>,
): Promise<JobOutcome<T>> {
  const span = tracer.startSpan(`job ${trigger}:${kind}`, {
    attributes: { "job.kind": kind, "job.trigger": trigger },
  });
  return context.with(trace.setSpan(context.active(), span), async () => {
    try {
      return await runJobInner(deps, kind, trigger, fn, options);
    } finally {
      span.end();
    }
  });
}

async function runJobInner<T>(
  deps: RunJobDeps,
  kind: string,
  trigger: JobTrigger,
  fn: (runId: string) => Promise<T>,
  options?: RunJobOptions<T>,
): Promise<JobOutcome<T>> {
  const { repos, log } = deps;

  const existing = await repos.jobRuns.findRunning(kind);
  if (existing !== null) {
    log.warn({ kind, runId: existing.id }, "Job already running, skipping");
    return { status: "already_running", runId: existing.id };
  }

  const { id } = await repos.jobRuns.start({ kind, trigger });
  const startMs = Date.now();
  log.info({ kind, runId: id, trigger }, "Job started");

  try {
    const result = await fn(id);
    const durationMs = Date.now() - startMs;
    const summary = options?.summarize?.(result);
    const noop = options?.classifyNoop?.(result) ?? null;
    await repos.jobRuns.succeed(id, { durationMs, result: summary, noop });
    log.info({ kind, runId: id, durationMs }, "Job succeeded");
    return { status: "succeeded", result };
  } catch (error) {
    const durationMs = Date.now() - startMs;
    const message = error instanceof Error ? error.message : String(error);
    // Jobs swallow their errors so cron timers stay alive, so this catch is the
    // only place a failed background run can be reported. Report before the row
    // write, so a failing `fail()` (the DB being the reason the job died, say)
    // cannot swallow the only push-based signal.
    captureJobFailure(error, { kind, trigger, runId: id });
    await repos.jobRuns.fail(id, { durationMs, errorMessage: message });
    log.error({ err: error, kind, runId: id, durationMs }, "Job failed");
    trace.getActiveSpan()?.setStatus({ code: SpanStatusCode.ERROR, message });
    return { status: "failed", message };
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
  fn: (runId: string) => Promise<T>,
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

  const span = tracer.startSpan(`job ${trigger}:${kind}`, {
    attributes: { "job.kind": kind, "job.trigger": trigger, "job.run_id": id },
  });

  // Fire-and-forget: schedule the work on the event loop and return the
  // runId immediately. Errors go to the row and to Sentry, never rethrown —
  // there is no caller left to catch them by the time `fn` settles.
  setImmediate(() => {
    void context.with(trace.setSpan(context.active(), span), async () => {
      try {
        const result = await fn(id);
        const durationMs = Date.now() - startMs;
        const summary = options?.summarize?.(result);
        const noop = options?.classifyNoop?.(result) ?? null;
        await repos.jobRuns.succeed(id, { durationMs, result: summary, noop });
        log.info({ kind, runId: id, durationMs }, "Job succeeded (async)");
      } catch (error) {
        const durationMs = Date.now() - startMs;
        const message = error instanceof Error ? error.message : String(error);
        span.setStatus({ code: SpanStatusCode.ERROR, message });
        // See the note in runJobInner: fire-and-forget work has no caller left
        // to surface the throw, so this is the only reporting path.
        captureJobFailure(error, { kind, trigger, runId: id });
        try {
          await repos.jobRuns.fail(id, { durationMs, errorMessage: message });
        } catch (writeError) {
          captureJobFailure(writeError, { kind, trigger, runId: id });
          log.error({ err: writeError, kind, runId: id }, "Failed to write job_runs failure row");
        }
        log.error({ err: error, kind, runId: id, durationMs }, "Job failed (async)");
      } finally {
        span.end();
      }
    });
  });

  return { runId: id, status: "running" };
}

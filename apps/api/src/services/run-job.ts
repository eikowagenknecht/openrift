import type { JobTrigger } from "@openrift/shared";
import type { Logger } from "@openrift/shared/logger";
import { context, SpanStatusCode, trace } from "@opentelemetry/api";
import * as Sentry from "@sentry/bun";

import type { Repos } from "../deps.js";

const tracer = trace.getTracer("openrift-api/jobs");

export type JobOutcome<T> =
  | { status: "succeeded"; result: T }
  | { status: "failed"; message: string }
  | { status: "already_running"; runId: string };

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
  summarize?: (result: T) => unknown;
  classifyNoop?: (result: T) => boolean;
}

interface RunJobDeps {
  repos: Pick<Repos, "jobRuns">;
  log: Logger;
}

/**
 * A partial unique index on running rows lets only one insert win; a loser
 * re-reads the winner's row.
 */
async function claimRun(
  deps: RunJobDeps,
  kind: string,
  trigger: JobTrigger,
): Promise<{ started: string } | { alreadyRunning: string }> {
  const { repos } = deps;
  for (let attempt = 0; attempt < 3; attempt++) {
    const existing = await repos.jobRuns.findRunning(kind);
    if (existing !== null) {
      return { alreadyRunning: existing.id };
    }
    const started = await repos.jobRuns.start({ kind, trigger });
    if (started !== null) {
      return { started: started.id };
    }
    // Lost the race; the winner's row may finish before the next attempt reads it.
  }
  throw new Error(`Could not claim a run for job kind "${kind}"`);
}

/**
 * Never rethrows: a failing `fn` is logged, reported to Sentry, and recorded
 * as a failed run; the caller gets `null`.
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
 * A failing `fn` becomes a `failed` outcome, not a rejection; only a
 * `job_runs` write failure propagates.
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

  const claim = await claimRun(deps, kind, trigger);
  if ("alreadyRunning" in claim) {
    log.warn({ kind, runId: claim.alreadyRunning }, "Job already running, skipping");
    return { status: "already_running", runId: claim.alreadyRunning };
  }

  const id = claim.started;
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
    // Report to Sentry before the row write: a failing `fail()` must not swallow the only signal.
    captureJobFailure(error, { kind, trigger, runId: id });
    await repos.jobRuns.fail(id, { durationMs, errorMessage: message });
    log.error({ err: error, kind, runId: id, durationMs }, "Job failed");
    trace.getActiveSpan()?.setStatus({ code: SpanStatusCode.ERROR, message });
    return { status: "failed", message };
  }
}

/**
 * If a run of the same `kind` is already `running`, returns the existing
 * runId as `already_running` and does not start a duplicate.
 */
export async function runJobAsync<T>(
  deps: RunJobDeps,
  kind: string,
  trigger: JobTrigger,
  fn: (runId: string) => Promise<T>,
  options?: RunJobOptions<T>,
): Promise<{ runId: string; status: "running" | "already_running" }> {
  const { repos, log } = deps;

  const claim = await claimRun(deps, kind, trigger);
  if ("alreadyRunning" in claim) {
    log.warn(
      { kind, runId: claim.alreadyRunning },
      "Job already running, returning existing runId",
    );
    return { runId: claim.alreadyRunning, status: "already_running" };
  }

  const id = claim.started;
  const startMs = Date.now();
  log.info({ kind, runId: id, trigger }, "Job started (async)");

  const span = tracer.startSpan(`job ${trigger}:${kind}`, {
    attributes: { "job.kind": kind, "job.trigger": trigger, "job.run_id": id },
  });

  // Fire-and-forget: no caller remains to catch a throw once `fn` settles.
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

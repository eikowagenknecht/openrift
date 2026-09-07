import type { Logger } from "@openrift/shared/logger";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Repos } from "../../../deps.js";
import { runJob, runJobAsync, runJobOutcome } from "./run-job.js";

const captureException = vi.fn();
vi.mock("@sentry/bun", () => ({
  captureException: (...args: unknown[]) => captureException(...args),
}));

function createMockDeps() {
  const start = vi.fn(async (): Promise<{ id: string }> => ({ id: "run-1" }));
  const succeed = vi.fn(async (): Promise<void> => undefined);
  const fail = vi.fn(async (): Promise<void> => undefined);
  const findRunning = vi.fn(async (): Promise<{ id: string } | null> => null);

  const log: Logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn(),
  } as unknown as Logger;

  return {
    deps: {
      repos: {
        jobRuns: {
          start,
          succeed,
          fail,
          findRunning,
          listRecent: vi.fn(),
          getLatestPerKind: vi.fn(),
          sweepOrphaned: vi.fn(),
          purgeOlderThan: vi.fn(),
        },
      } as unknown as Pick<Repos, "jobRuns">,
      log,
    },
    mocks: { start, succeed, fail, findRunning, log },
  };
}

describe("runJob", () => {
  let ctx: ReturnType<typeof createMockDeps>;

  beforeEach(() => {
    ctx = createMockDeps();
    captureException.mockClear();
  });

  it("runs fn, marks row succeeded with summarized result, and returns the value", async () => {
    const fn = vi.fn(async () => ({ transformed: 42 }));
    const result = await runJob(ctx.deps, "tcgplayer.refresh", "cron", fn, {
      summarize: (r) => ({ transformed: r.transformed }),
    });

    expect(result).toEqual({ transformed: 42 });
    expect(fn).toHaveBeenCalledOnce();
    expect(ctx.mocks.start).toHaveBeenCalledWith({ kind: "tcgplayer.refresh", trigger: "cron" });
    expect(ctx.mocks.succeed).toHaveBeenCalledWith(
      "run-1",
      expect.objectContaining({ result: { transformed: 42 } }),
    );
    expect(ctx.mocks.fail).not.toHaveBeenCalled();
  });

  it("omits summary when no summarize option is given", async () => {
    await runJob(ctx.deps, "k", "cron", async () => "ignored");
    expect(ctx.mocks.succeed).toHaveBeenCalledWith(
      "run-1",
      expect.objectContaining({ result: undefined }),
    );
  });

  it("records noop=true when classifyNoop reports no work", async () => {
    await runJob(ctx.deps, "k", "cron", async () => ({ sent: 0 }), {
      classifyNoop: (r) => r.sent === 0,
    });
    expect(ctx.mocks.succeed).toHaveBeenCalledWith(
      "run-1",
      expect.objectContaining({ noop: true }),
    );
  });

  it("records noop=false when classifyNoop reports work was done", async () => {
    await runJob(ctx.deps, "k", "cron", async () => ({ sent: 3 }), {
      classifyNoop: (r) => r.sent === 0,
    });
    expect(ctx.mocks.succeed).toHaveBeenCalledWith(
      "run-1",
      expect.objectContaining({ noop: false }),
    );
  });

  it("leaves noop null when no classifier is given", async () => {
    await runJob(ctx.deps, "k", "cron", async () => "ignored");
    expect(ctx.mocks.succeed).toHaveBeenCalledWith(
      "run-1",
      expect.objectContaining({ noop: null }),
    );
  });

  it("catches fn errors, writes failed row with message, returns null", async () => {
    const fn = vi.fn(async () => {
      throw new Error("boom");
    });
    const result = await runJob(ctx.deps, "k", "cron", fn);

    expect(result).toBeNull();
    expect(ctx.mocks.fail).toHaveBeenCalledWith(
      "run-1",
      expect.objectContaining({ errorMessage: "boom" }),
    );
    expect(ctx.mocks.succeed).not.toHaveBeenCalled();
  });

  it("reports the failure to Sentry with the job's kind, trigger and run id", async () => {
    const error = new Error("boom");
    await runJob(ctx.deps, "tcgplayer.refresh", "cron", async () => {
      throw error;
    });

    expect(captureException).toHaveBeenCalledWith(error, {
      tags: { source: "job", "job.kind": "tcgplayer.refresh", "job.trigger": "cron" },
      extra: { runId: "run-1" },
    });
  });

  it("reports to Sentry even when writing the failed row throws", async () => {
    const error = new Error("boom");
    const writeError = new Error("db down");
    ctx.mocks.fail.mockRejectedValueOnce(writeError);

    await expect(
      runJob(ctx.deps, "k", "cron", async () => {
        throw error;
      }),
    ).rejects.toThrow("db down");
    expect(captureException).toHaveBeenCalledWith(error, expect.anything());
  });

  it("does not report a successful run", async () => {
    await runJob(ctx.deps, "k", "cron", async () => "fine");
    expect(captureException).not.toHaveBeenCalled();
  });

  it("does not report a skipped run", async () => {
    ctx.mocks.findRunning.mockResolvedValueOnce({ id: "existing-run" });
    await runJob(ctx.deps, "k", "cron", async () => "never");
    expect(captureException).not.toHaveBeenCalled();
  });

  it("serializes non-Error throws to string", async () => {
    const fn = vi.fn(async () => {
      // oxlint-disable-next-line no-throw-literal, typescript/only-throw-error -- testing the String(error) fallback
      throw "string-boom";
    });
    await runJob(ctx.deps, "k", "cron", fn);
    expect(ctx.mocks.fail).toHaveBeenCalledWith(
      "run-1",
      expect.objectContaining({ errorMessage: "string-boom" }),
    );
  });

  it("skips when a run of the same kind is already running (re-entrancy guard)", async () => {
    ctx.mocks.findRunning.mockResolvedValueOnce({ id: "existing-run" });
    const fn = vi.fn(async () => "never");
    const result = await runJob(ctx.deps, "k", "cron", fn);

    expect(result).toBeNull();
    expect(fn).not.toHaveBeenCalled();
    expect(ctx.mocks.start).not.toHaveBeenCalled();
  });
});

describe("runJobOutcome", () => {
  let ctx: ReturnType<typeof createMockDeps>;

  beforeEach(() => {
    ctx = createMockDeps();
    captureException.mockClear();
  });

  it("reports a succeeded outcome carrying the raw result", async () => {
    const outcome = await runJobOutcome(ctx.deps, "k", "admin", async () => ({ posted: 2 }));
    expect(outcome).toEqual({ status: "succeeded", result: { posted: 2 } });
  });

  it("distinguishes a failed run from a skipped one", async () => {
    const failed = await runJobOutcome(ctx.deps, "k", "admin", async () => {
      throw new Error("boom");
    });
    expect(failed).toEqual({ status: "failed", message: "boom" });

    ctx.mocks.findRunning.mockResolvedValueOnce({ id: "existing-run" });
    const skipped = await runJobOutcome(ctx.deps, "k", "admin", async () => "never");
    expect(skipped).toEqual({ status: "already_running", runId: "existing-run" });
  });

  it("reports a job that legitimately resolves to null as succeeded", async () => {
    const outcome = await runJobOutcome(ctx.deps, "k", "admin", async () => null);
    expect(outcome).toEqual({ status: "succeeded", result: null });
  });
});

describe("runJobAsync", () => {
  let ctx: ReturnType<typeof createMockDeps>;

  beforeEach(() => {
    ctx = createMockDeps();
    captureException.mockClear();
  });

  it("returns runId immediately with status 'running'", async () => {
    const fn = vi.fn(async () => "done");
    const { runId, status } = await runJobAsync(ctx.deps, "k", "admin", fn);

    expect(runId).toBe("run-1");
    expect(status).toBe("running");
    expect(ctx.mocks.start).toHaveBeenCalledWith({ kind: "k", trigger: "admin" });
  });

  it("returns existing runId with 'already_running' when a run is in flight", async () => {
    ctx.mocks.findRunning.mockResolvedValueOnce({ id: "existing-run" });
    const fn = vi.fn(async () => "never");
    const { runId, status } = await runJobAsync(ctx.deps, "k", "admin", fn);

    expect(runId).toBe("existing-run");
    expect(status).toBe("already_running");
    expect(fn).not.toHaveBeenCalled();
    expect(ctx.mocks.start).not.toHaveBeenCalled();
  });

  it("writes a succeeded row once the background fn resolves", async () => {
    const fn = vi.fn(async () => "hello");
    await runJobAsync(ctx.deps, "k", "admin", fn, { summarize: (r) => ({ r }) });

    await vi.waitFor(() => {
      expect(ctx.mocks.succeed).toHaveBeenCalledWith(
        "run-1",
        expect.objectContaining({ result: { r: "hello" } }),
      );
    });
    expect(fn).toHaveBeenCalledOnce();
  });

  it("writes a failed row and does not throw when background fn rejects", async () => {
    const fn = vi.fn(async () => {
      throw new Error("async-boom");
    });
    await runJobAsync(ctx.deps, "k", "admin", fn);

    await vi.waitFor(() => {
      expect(ctx.mocks.fail).toHaveBeenCalledWith(
        "run-1",
        expect.objectContaining({ errorMessage: "async-boom" }),
      );
    });
    expect(ctx.mocks.succeed).not.toHaveBeenCalled();
  });

  it("reports the background failure to Sentry", async () => {
    const error = new Error("async-boom");
    await runJobAsync(ctx.deps, "images.rehost", "admin", async () => {
      throw error;
    });

    await vi.waitFor(() => {
      expect(captureException).toHaveBeenCalledWith(error, {
        tags: { source: "job", "job.kind": "images.rehost", "job.trigger": "admin" },
        extra: { runId: "run-1" },
      });
    });
  });

  it("reports the row write failure too when it cannot record the failed run", async () => {
    const writeError = new Error("db down");
    ctx.mocks.fail.mockRejectedValueOnce(writeError);
    await runJobAsync(ctx.deps, "k", "admin", async () => {
      throw new Error("async-boom");
    });

    await vi.waitFor(() => {
      expect(captureException).toHaveBeenCalledWith(writeError, expect.anything());
    });
    expect(captureException).toHaveBeenCalledTimes(2);
  });
});

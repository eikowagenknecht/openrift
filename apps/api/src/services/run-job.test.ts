import type { Logger } from "@openrift/shared/logger";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Repos } from "../deps.js";
import { runJob, runJobAsync } from "./run-job.js";

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

  it("serializes non-Error throws to string", async () => {
    const fn = vi.fn(async () => {
      // oxlint-disable-next-line no-throw-literal -- testing the String(error) fallback
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

describe("runJobAsync", () => {
  let ctx: ReturnType<typeof createMockDeps>;

  beforeEach(() => {
    ctx = createMockDeps();
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
});

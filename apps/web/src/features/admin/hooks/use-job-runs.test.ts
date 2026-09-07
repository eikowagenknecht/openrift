import { keepPreviousData } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import type { JobRunsQueryParams } from "./use-job-runs";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain = {
      handler: (fn: (...args: unknown[]) => unknown) => fn,
      validator: () => chain,
      middleware: () => chain,
    };
    return chain;
  },
  createMiddleware: () => ({ server: (fn: (...args: unknown[]) => unknown) => fn }),
}));

const { adminJobRunsQueryOptions, JOB_RUNS_PAGE_SIZE } = await import("./use-job-runs");

describe("adminJobRunsQueryOptions", () => {
  it("encodes the page and filters into the query key", () => {
    const params = {
      page: 3,
      kind: "images.regenerate",
      trigger: "cron",
      status: "failed",
    } satisfies JobRunsQueryParams;
    expect(adminJobRunsQueryOptions(params).queryKey).toEqual([
      "admin",
      "job-runs",
      "list",
      params,
    ]);
  });

  it("auto-refreshes only on the first page", () => {
    expect(adminJobRunsQueryOptions({ page: 1 }).refetchInterval).toBe(15_000);
    expect(adminJobRunsQueryOptions({ page: 2 }).refetchInterval).toBe(false);
  });

  it("keeps the previous page on screen while the next loads", () => {
    expect(adminJobRunsQueryOptions({ page: 2 }).placeholderData).toBe(keepPreviousData);
  });

  it("exposes a fixed page size", () => {
    expect(JOB_RUNS_PAGE_SIZE).toBe(50);
  });
});

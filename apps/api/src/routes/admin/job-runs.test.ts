import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerRouterForTest } from "../../test/mount-router.js";
import type { Variables } from "../../types.js";
import { adminJobRunsRouter } from "./job-runs";

const mockJobRuns = {
  listPage: vi.fn(),
  listKinds: vi.fn(),
};

const USER_ID = "a0000000-0001-4000-a000-000000000001";

// Mount the oRPC router directly (without the requireAdmin gate). AppErrors are
// bridged to ORPCErrors inside the router, so 4xx/5xx responses carry
// `{ message }`.
const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("user", { id: USER_ID } as never);
  c.set("repos", { jobRuns: mockJobRuns } as never);
  await next();
});
registerRouterForTest(app, adminJobRunsRouter);

const baseRow = {
  id: "019d4999-4219-72f6-b7bb-64004e1b1bff",
  kind: "tcgplayer.refresh",
  trigger: "cron" as const,
  status: "succeeded" as const,
  startedAt: new Date("2026-04-01T10:00:00.000Z"),
  finishedAt: new Date("2026-04-01T10:01:00.000Z"),
  durationMs: 60_000,
  errorMessage: null,
  result: { updated: 5 },
  noop: false,
};

describe("GET /job-runs", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns the runs page with kinds (happy path)", async () => {
    mockJobRuns.listPage.mockResolvedValue({ rows: [baseRow], total: 1 });
    mockJobRuns.listKinds.mockResolvedValue(["tcgplayer.refresh", "cardmarket.refresh"]);

    const res = await app.request("/api/admin/v1/job-runs");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.runs).toHaveLength(1);
    expect(json.runs[0]).toMatchObject({
      id: baseRow.id,
      kind: "tcgplayer.refresh",
      trigger: "cron",
      status: "succeeded",
      startedAt: "2026-04-01T10:00:00.000Z",
      finishedAt: "2026-04-01T10:01:00.000Z",
      durationMs: 60_000,
      errorMessage: null,
      result: { updated: 5 },
      noop: false,
    });
    expect(json.total).toBe(1);
    expect(json.page).toBe(1);
    expect(json.limit).toBe(50);
    expect(json.kinds).toEqual(["tcgplayer.refresh", "cardmarket.refresh"]);

    // Default paging: page 1, limit 50, offset 0, no filters.
    expect(mockJobRuns.listPage).toHaveBeenCalledWith({
      kind: undefined,
      trigger: undefined,
      status: undefined,
      noop: undefined,
      limit: 50,
      offset: 0,
    });
  });

  it("applies kind/page/limit query and computes the right offset", async () => {
    mockJobRuns.listPage.mockResolvedValue({ rows: [], total: 0 });
    mockJobRuns.listKinds.mockResolvedValue([]);

    const res = await app.request("/api/admin/v1/job-runs?kind=foo&page=2&limit=10");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.page).toBe(2);
    expect(json.limit).toBe(10);

    // page 2 with limit 10 → offset (2 - 1) * 10 = 10.
    expect(mockJobRuns.listPage).toHaveBeenCalledWith({
      kind: "foo",
      trigger: undefined,
      status: undefined,
      noop: undefined,
      limit: 10,
      offset: 10,
    });
  });

  it("nulls a non-object result and a null finishedAt", async () => {
    mockJobRuns.listPage.mockResolvedValue({
      rows: [{ ...baseRow, result: "not-an-object", finishedAt: null }],
      total: 1,
    });
    mockJobRuns.listKinds.mockResolvedValue(["tcgplayer.refresh"]);

    const res = await app.request("/api/admin/v1/job-runs");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.runs[0].result).toBeNull();
    expect(json.runs[0].finishedAt).toBeNull();
  });
});

import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerRouterForTest } from "../../../test/mount-router.js";
import { readJson } from "../../../test/read-json.js";
import type { Variables } from "../../../types.js";
import { adminJobRunsRouter } from "./admin-job-runs";

const mockJobRuns = {
  listPage: vi.fn(),
  listKinds: vi.fn(),
};

const USER_ID = "a0000000-0001-4000-a000-000000000001";

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
    const json = await readJson(res);
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

    expect(mockJobRuns.listPage).toHaveBeenCalledWith({
      kind: undefined,
      kindPrefix: undefined,
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
    const json = await readJson(res);
    expect(json.page).toBe(2);
    expect(json.limit).toBe(10);

    expect(mockJobRuns.listPage).toHaveBeenCalledWith({
      kind: "foo",
      kindPrefix: undefined,
      trigger: undefined,
      status: undefined,
      noop: undefined,
      limit: 10,
      offset: 10,
    });
  });

  it("passes a kind prefix through, so one job family reads as one list", async () => {
    mockJobRuns.listPage.mockResolvedValue({ rows: [], total: 0 });
    mockJobRuns.listKinds.mockResolvedValue([]);

    const res = await app.request("/api/admin/v1/job-runs?kindPrefix=meta.uvsgames_");
    expect(res.status).toBe(200);
    expect(mockJobRuns.listPage).toHaveBeenCalledWith(
      expect.objectContaining({ kindPrefix: "meta.uvsgames_" }),
    );
  });

  it("nulls a non-object result and a null finishedAt", async () => {
    mockJobRuns.listPage.mockResolvedValue({
      rows: [{ ...baseRow, result: "not-an-object", finishedAt: null }],
      total: 1,
    });
    mockJobRuns.listKinds.mockResolvedValue(["tcgplayer.refresh"]);

    const res = await app.request("/api/admin/v1/job-runs");
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.runs[0].result).toBeNull();
    expect(json.runs[0].finishedAt).toBeNull();
  });
});

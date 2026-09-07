import type { JobScheduleView } from "@openrift/shared/contracts/admin/job-schedules";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "../../errors.js";
import { registerRouterForTest } from "../../test/mount-router.js";
import { readJson } from "../../test/read-json.js";
import type { Variables } from "../../types.js";
import { adminJobSchedulesRouter } from "./job-schedules";

const mockScheduler = {
  list: vi.fn(),
  set: vi.fn(),
  disable: vi.fn(),
  enableSuggested: vi.fn(),
  runNow: vi.fn(),
};

const USER_ID = "a0000000-0001-4000-a000-000000000001";

function buildApp(scheduler: unknown) {
  const app = new Hono<{ Variables: Variables }>();
  app.use("*", async (c, next) => {
    c.set("user", { id: USER_ID } as never);
    c.set("scheduler", scheduler as never);
    await next();
  });
  registerRouterForTest(app, adminJobSchedulesRouter);
  return app;
}

const app = buildApp(mockScheduler);

const VIEW: JobScheduleView = {
  kind: "tcgplayer.refresh",
  title: "TCGPlayer price refresh",
  description: "Fetches the current TCGPlayer prices for every mapped printing.",
  suggestedSchedule: "0 6 * * *",
  schedule: "0 6 * * *",
  available: true,
  unavailableReason: null,
  nextRun: "2026-09-03T06:00:00.000Z",
  lastRun: null,
  updatedAt: "2026-09-02T06:00:00.000Z",
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe("GET /api/admin/v1/job-schedules", () => {
  it("returns every job", async () => {
    mockScheduler.list.mockResolvedValue([VIEW]);
    const res = await app.request("/api/admin/v1/job-schedules");
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ jobs: [VIEW] });
  });

  it("returns 503 when the app runs without a scheduler", async () => {
    const res = await buildApp(undefined).request("/api/admin/v1/job-schedules");
    expect(res.status).toBe(503);
    const json = await readJson(res);
    expect(json.message).toContain("not running");
  });
});

describe("PUT /api/admin/v1/job-schedules/:kind", () => {
  it("passes the kind and expression to the scheduler", async () => {
    mockScheduler.set.mockResolvedValue(VIEW);
    const res = await app.request("/api/admin/v1/job-schedules/tcgplayer.refresh", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schedule: "0 6 * * *" }),
    });
    expect(res.status).toBe(200);
    expect(mockScheduler.set).toHaveBeenCalledWith("tcgplayer.refresh", "0 6 * * *");
    expect(await readJson(res)).toEqual(VIEW);
  });

  it("returns 400 when the scheduler rejects the expression", async () => {
    mockScheduler.set.mockRejectedValue(
      new AppError(400, "BAD_REQUEST", "Invalid cron expression: nope"),
    );
    const res = await app.request("/api/admin/v1/job-schedules/tcgplayer.refresh", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schedule: "nope" }),
    });
    expect(res.status).toBe(400);
    const json = await readJson(res);
    expect(json.message).toContain("Invalid cron expression");
  });

  it("returns 400 for a kind that is not a scheduled job", async () => {
    const res = await app.request("/api/admin/v1/job-schedules/not.a.job", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schedule: "0 6 * * *" }),
    });
    expect(res.status).toBe(400);
    expect(mockScheduler.set).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/admin/v1/job-schedules/:kind", () => {
  it("turns the job off", async () => {
    mockScheduler.disable.mockResolvedValue({ ...VIEW, schedule: null, nextRun: null });
    const res = await app.request("/api/admin/v1/job-schedules/tcgplayer.refresh", {
      method: "DELETE",
    });
    expect(res.status).toBe(200);
    expect(mockScheduler.disable).toHaveBeenCalledWith("tcgplayer.refresh");
    const json = await readJson(res);
    expect(json.schedule).toBeNull();
  });
});

describe("POST /api/admin/v1/job-schedules/enable-suggested", () => {
  it("returns the full list after arming the suggested schedules", async () => {
    mockScheduler.enableSuggested.mockResolvedValue([VIEW]);
    const res = await app.request("/api/admin/v1/job-schedules/enable-suggested", {
      method: "POST",
    });
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ jobs: [VIEW] });
  });
});

describe("POST /api/admin/v1/job-schedules/:kind/run", () => {
  it("returns 202 with the new run id", async () => {
    mockScheduler.runNow.mockResolvedValue({ runId: "run-1", status: "running" });
    const res = await app.request("/api/admin/v1/job-schedules/tcgplayer.refresh/run", {
      method: "POST",
    });
    expect(res.status).toBe(202);
    expect(mockScheduler.runNow).toHaveBeenCalledWith("tcgplayer.refresh");
    expect(await readJson(res)).toEqual({ runId: "run-1", status: "running" });
  });

  it("returns 400 for an unavailable job", async () => {
    mockScheduler.runNow.mockRejectedValue(
      new AppError(400, "BAD_REQUEST", "CARDTRADER_API_TOKEN is not set."),
    );
    const res = await app.request("/api/admin/v1/job-schedules/cardtrader.refresh/run", {
      method: "POST",
    });
    expect(res.status).toBe(400);
    const json = await readJson(res);
    expect(json.message).toContain("CARDTRADER_API_TOKEN");
  });
});

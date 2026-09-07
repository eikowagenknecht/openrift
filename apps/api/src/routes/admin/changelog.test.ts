import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerRouterForTest } from "../../test/mount-router.js";
import { readJson } from "../../test/read-json.js";
import type { Variables } from "../../types.js";

vi.mock("../../services/changelog-discord.js", () => ({
  extractWatermark: vi.fn(() => null),
  postChangelogToDiscord: vi.fn(),
}));
vi.mock("../../services/run-job.js", () => ({
  runJobOutcome: vi.fn(),
}));

// eslint-disable-next-line import/first -- imported after vi.mock so the mocks apply.
import { runJobOutcome } from "../../services/run-job.js";
// eslint-disable-next-line import/first
import { adminChangelogRouter } from "./changelog";

const runJobMock = vi.mocked(runJobOutcome);

const mockJobRuns = {
  findLatestForResume: vi.fn(),
};

const USER_ID = "a0000000-0001-4000-a000-000000000001";

const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("user", { id: USER_ID } as never);
  c.set("repos", { jobRuns: mockJobRuns } as never);
  c.set("config", {
    discordWebhooks: { changelog: "https://discord.example/webhook" },
    changelogPath: "/tmp/CHANGELOG.md",
  } as never);
  await next();
});
registerRouterForTest(app, adminChangelogRouter);

describe("POST /changelog/post", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockJobRuns.findLatestForResume.mockResolvedValue(undefined);
  });

  it("returns posted=true with the count when entries were posted", async () => {
    runJobMock.mockResolvedValue({ status: "succeeded", result: { posted: 2 } } as never);

    const res = await app.request("/api/admin/v1/changelog/post", { method: "POST" });
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ posted: true, count: 2 });
    expect(runJobMock).toHaveBeenCalledTimes(1);
  });

  it("returns posted=false with count 0 when nothing was posted", async () => {
    runJobMock.mockResolvedValue({ status: "succeeded", result: { posted: 0 } } as never);

    const res = await app.request("/api/admin/v1/changelog/post", { method: "POST" });
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ posted: false, count: 0 });
  });

  it("500s with the job's message when the post failed, rather than a 200 no-op", async () => {
    runJobMock.mockResolvedValue({ status: "failed", message: "Discord 503" } as never);

    const res = await app.request("/api/admin/v1/changelog/post", { method: "POST" });
    expect(res.status).toBe(500);
    expect(await readJson(res)).toMatchObject({ message: "Changelog post failed: Discord 503" });
  });

  it("409s when a changelog post is already running", async () => {
    runJobMock.mockResolvedValue({ status: "already_running", runId: "run-1" } as never);

    const res = await app.request("/api/admin/v1/changelog/post", { method: "POST" });
    expect(res.status).toBe(409);
    expect(await readJson(res)).toMatchObject({
      message: expect.stringContaining("already running"),
    });
  });
});

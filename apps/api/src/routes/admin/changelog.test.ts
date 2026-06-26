import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { Hono } from "hono";
import type { Context } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Variables } from "../../types.js";

// The router calls the changelog-discord service helpers and run-job at module
// load + request time; mock both so no real Discord post / job runner runs.
vi.mock("../../services/changelog-discord.js", () => ({
  extractWatermark: vi.fn(() => null),
  postChangelogToDiscord: vi.fn(),
}));
vi.mock("../../services/run-job.js", () => ({
  runJob: vi.fn(),
}));

// eslint-disable-next-line import/first -- imported after vi.mock so the mocks apply.
import { appErrorInterceptor } from "../../orpc/app-error-interceptor.js";
// eslint-disable-next-line import/first -- imported after vi.mock so the mocks apply.
import { buildApiContext } from "../../orpc/context.js";
// eslint-disable-next-line import/first -- imported after vi.mock so the mocks apply.
import { runJob } from "../../services/run-job.js";
// eslint-disable-next-line import/first
import { adminChangelogRouter } from "./changelog";

const runJobMock = vi.mocked(runJob);

const mockJobRuns = {
  findLatestForResume: vi.fn(),
};

const USER_ID = "a0000000-0001-4000-a000-000000000001";

// Mount the oRPC router directly (without the requireAdmin gate). AppErrors are
// bridged to ORPCErrors inside the router, so 4xx/5xx responses carry
// `{ message }`.
const handler = new OpenAPIHandler(adminChangelogRouter, { interceptors: [appErrorInterceptor] });
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

const handle = async (c: Context<{ Variables: Variables }>) => {
  const { matched, response } = await handler.handle(c.req.raw, {
    context: buildApiContext(c),
  });
  if (matched && response) {
    return response;
  }
  return c.notFound();
};
for (const path of ["/api/admin/v1/changelog/post"]) {
  app.all(path, handle);
}

describe("POST /changelog/post", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockJobRuns.findLatestForResume.mockResolvedValue(undefined);
  });

  it("returns posted=true with the count when entries were posted", async () => {
    runJobMock.mockResolvedValue({ posted: 2 } as never);

    const res = await app.request("/api/admin/v1/changelog/post", { method: "POST" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ posted: true, count: 2 });
    expect(runJobMock).toHaveBeenCalledTimes(1);
  });

  it("returns posted=false with count 0 when nothing was posted", async () => {
    runJobMock.mockResolvedValue({ posted: 0 } as never);

    const res = await app.request("/api/admin/v1/changelog/post", { method: "POST" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ posted: false, count: 0 });
  });
});

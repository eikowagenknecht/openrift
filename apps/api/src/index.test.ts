import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { healthRoute } from "./routes/health.js";

// ---------------------------------------------------------------------------
// Mock repos
// ---------------------------------------------------------------------------

const mockSetsRepo = {
  ping: vi.fn(() => Promise.resolve(true)),
  hasAny: vi.fn(() => Promise.resolve(true)),
};

// oxlint-disable-next-line -- test mock doesn't match full Repos type
const app = new Hono()
  .use("*", async (c, next) => {
    c.set("repos", { sets: mockSetsRepo } as never);
    await next();
  })
  .route("/api", healthRoute);

// ---------------------------------------------------------------------------
// GET /api/health
// ---------------------------------------------------------------------------

describe("GET /api/health", () => {
  beforeEach(() => {
    mockSetsRepo.ping.mockReset().mockResolvedValue(true);
    mockSetsRepo.hasAny.mockReset().mockResolvedValue(true);
  });

  it('returns { status: "ok" } when db is healthy and has data', async () => {
    const res = await app.fetch(new Request("http://localhost/api/health"));
    expect(res.status).toBe(200);

    const json = (await res.json()) as { status: string };
    expect(json.status).toBe("ok");
  });

  it('returns 503 { status: "db_unreachable" } when sql ping fails', async () => {
    mockSetsRepo.ping.mockResolvedValue(false);

    const res = await app.fetch(new Request("http://localhost/api/health"));
    expect(res.status).toBe(503);

    const json = (await res.json()) as { status: string };
    expect(json.status).toBe("db_unreachable");
  });

  it('returns 503 { status: "db_not_migrated" } when sets table does not exist', async () => {
    mockSetsRepo.hasAny.mockRejectedValue(new Error("relation does not exist"));

    const res = await app.fetch(new Request("http://localhost/api/health"));
    expect(res.status).toBe(503);

    const json = (await res.json()) as { status: string };
    expect(json.status).toBe("db_not_migrated");
  });

  it('returns 503 { status: "db_empty" } when sets table is empty', async () => {
    mockSetsRepo.hasAny.mockResolvedValue(false);

    const res = await app.fetch(new Request("http://localhost/api/health"));
    expect(res.status).toBe(503);

    const json = (await res.json()) as { status: string };
    expect(json.status).toBe("db_empty");
  });
});

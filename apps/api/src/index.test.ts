import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { healthRoute } from "./routes/public/health.js";

// ---------------------------------------------------------------------------
// Mock repos
// ---------------------------------------------------------------------------

const mockHealthRepo = {
  healthCheck: vi.fn(() => Promise.resolve("ok" as const)),
};

// oxlint-disable-next-line -- test mock doesn't match full Repos type
const app = new Hono()
  .use("*", async (c, next) => {
    c.set("repos", { health: mockHealthRepo } as never);
    await next();
  })
  .route("/api", healthRoute);

// ---------------------------------------------------------------------------
// GET /api/health
// ---------------------------------------------------------------------------

describe("GET /api/health", () => {
  beforeEach(() => {
    mockHealthRepo.healthCheck.mockReset().mockResolvedValue("ok");
  });

  it('returns 200 { status: "ok" } when db is healthy and has data', async () => {
    const res = await app.fetch(new Request("http://localhost/api/health"));
    expect(res.status).toBe(200);

    const json = (await res.json()) as { status: string };
    expect(json.status).toBe("ok");
  });

  it('returns 200 { status: "db_empty" } when sets table exists but is empty', async () => {
    mockHealthRepo.healthCheck.mockResolvedValue("db_empty");

    const res = await app.fetch(new Request("http://localhost/api/health"));
    expect(res.status).toBe(200);

    const json = (await res.json()) as { status: string };
    expect(json.status).toBe("db_empty");
  });

  it('returns 503 { status: "db_unreachable" } when health check times out or connection fails', async () => {
    mockHealthRepo.healthCheck.mockResolvedValue("db_unreachable");

    const res = await app.fetch(new Request("http://localhost/api/health"));
    expect(res.status).toBe(503);

    const json = (await res.json()) as { status: string };
    expect(json.status).toBe("db_unreachable");
  });

  it('returns 503 { status: "db_not_migrated" } when sets table does not exist', async () => {
    mockHealthRepo.healthCheck.mockResolvedValue("db_not_migrated");

    const res = await app.fetch(new Request("http://localhost/api/health"));
    expect(res.status).toBe(503);

    const json = (await res.json()) as { status: string };
    expect(json.status).toBe("db_not_migrated");
  });

  it("sets Cache-Control: no-store header", async () => {
    const res = await app.fetch(new Request("http://localhost/api/health"));
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});

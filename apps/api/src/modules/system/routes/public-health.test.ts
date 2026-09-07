import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { readJson } from "../../../test/read-json.js";
import type { Variables } from "../../../types.js";
import { healthRoute } from "./public-health";

const mockHealthRepo = {
  healthCheck: vi.fn(() => Promise.resolve("ok" as string)),
};

const app = new Hono<{ Variables: Variables }>()
  .use("*", async (c, next) => {
    c.set("repos", { health: mockHealthRepo } as never);
    await next();
  })
  // Production mounts health unversioned at /api, not /api/v1.
  .route("/api", healthRoute);

describe("GET /api/health", () => {
  beforeEach(() => {
    mockHealthRepo.healthCheck.mockReset();
  });

  it("returns 200 with status ok when health check passes", async () => {
    mockHealthRepo.healthCheck.mockResolvedValue("ok");
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.status).toBe("ok");
  });

  it("returns 200 with status db_empty when database is empty", async () => {
    mockHealthRepo.healthCheck.mockResolvedValue("db_empty");
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.status).toBe("db_empty");
  });

  it("returns 503 when health check returns an error status", async () => {
    mockHealthRepo.healthCheck.mockResolvedValue("db_error");
    const res = await app.request("/api/health");
    expect(res.status).toBe(503);
    const json = await readJson(res);
    expect(json.status).toBe("db_error");
  });

  it("returns 503 for timeout status", async () => {
    mockHealthRepo.healthCheck.mockResolvedValue("timeout");
    const res = await app.request("/api/health");
    expect(res.status).toBe(503);
    const json = await readJson(res);
    expect(json.status).toBe("timeout");
  });

  it("sets Cache-Control to no-store", async () => {
    mockHealthRepo.healthCheck.mockResolvedValue("ok");
    const res = await app.request("/api/health");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("passes timeout constant to health check", async () => {
    mockHealthRepo.healthCheck.mockResolvedValue("ok");
    await app.request("/api/health");
    expect(mockHealthRepo.healthCheck).toHaveBeenCalledWith(5000);
  });

  it("calls healthCheck exactly once per request", async () => {
    mockHealthRepo.healthCheck.mockResolvedValue("ok");
    await app.request("/api/health");
    expect(mockHealthRepo.healthCheck).toHaveBeenCalledTimes(1);
  });
});

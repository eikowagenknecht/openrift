import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerRouterForTest } from "../../test/mount-router.js";
import { readJson } from "../../test/read-json.js";
import type { Variables } from "../../types.js";
import { adminCacheRouter } from "./cache";

const mockFetch = vi.fn();

// Mount the oRPC router directly (without the requireAdmin gate). AppErrors are
// bridged to ORPCErrors inside the router, so 4xx/5xx responses carry
// `{ message }`.
function buildApp(cloudflare: { apiToken: string; zoneId: string } | undefined) {
  const app = new Hono<{ Variables: Variables }>();
  app.use("*", async (c, next) => {
    c.set("io", { fetch: mockFetch } as never);
    c.set("config", { cloudflare } as never);
    c.set("user", { id: "a0000000-0001-4000-a000-000000000001" } as never);
    await next();
  });
  registerRouterForTest(app, adminCacheRouter);
  return app;
}

const configured = { apiToken: "token-abc", zoneId: "zone-xyz" };

describe("GET /cache/status", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns configured=true when credentials are set", async () => {
    const app = buildApp(configured);
    const res = await app.request("/api/admin/v1/cache/status");
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ configured: true });
  });

  it("returns configured=false when credentials are missing", async () => {
    const app = buildApp(undefined);
    const res = await app.request("/api/admin/v1/cache/status");
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ configured: false });
  });
});

describe("POST /cache/purge", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 and calls Cloudflare purge_cache with purge_everything", async () => {
    mockFetch.mockResolvedValue(new Response(null, { status: 200 }));
    const app = buildApp(configured);

    const res = await app.request("/api/admin/v1/cache/purge", { method: "POST" });

    expect(res.status).toBe(204);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.cloudflare.com/client/v4/zones/zone-xyz/purge_cache");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer token-abc");
    expect(init.body).toBe(JSON.stringify({ purge_everything: true }));
  });

  it("returns 503 when Cloudflare credentials are not configured", async () => {
    const app = buildApp(undefined);

    const res = await app.request("/api/admin/v1/cache/purge", { method: "POST" });

    expect(res.status).toBe(503);
    expect(mockFetch).not.toHaveBeenCalled();
    const json = await readJson(res);
    expect(json.message).toContain("not configured");
  });

  it("returns 502 without leaking the Cloudflare error body to the client", async () => {
    mockFetch.mockResolvedValue(
      Response.json({ errors: [{ message: "bad zone" }] }, { status: 400 }),
    );
    const app = buildApp(configured);

    const res = await app.request("/api/admin/v1/cache/purge", { method: "POST" });

    expect(res.status).toBe(502);
    const json = await readJson(res);
    expect(json.message).toContain("Cloudflare purge failed");
    expect(json.message).not.toContain("bad zone");
  });
});

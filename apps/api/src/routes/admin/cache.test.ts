import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "../../errors.js";
import { adminCacheRoute } from "./cache.js";

// ---------------------------------------------------------------------------
// Test app
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();

function buildApp(cloudflare: { apiToken: string; zoneId: string } | undefined) {
  return new Hono()
    .use("*", async (c, next) => {
      c.set("io", { fetch: mockFetch } as never);
      c.set("config", { cloudflare } as never);
      await next();
    })
    .route("/api/v1", adminCacheRoute)
    .onError((err, c) => {
      if (err instanceof AppError) {
        return c.json({ error: err.message, code: err.code }, err.status as 400);
      }
      throw err;
    });
}

const configured = { apiToken: "token-abc", zoneId: "zone-xyz" };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/v1/cache/status", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns configured=true when credentials are set", async () => {
    const app = buildApp(configured);
    const res = await app.request("/api/v1/cache/status");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ configured: true });
  });

  it("returns configured=false when credentials are missing", async () => {
    const app = buildApp(undefined);
    const res = await app.request("/api/v1/cache/status");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ configured: false });
  });
});

describe("POST /api/v1/cache/purge", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 and calls Cloudflare purge_cache with purge_everything", async () => {
    mockFetch.mockResolvedValue(new Response(null, { status: 200 }));
    const app = buildApp(configured);

    const res = await app.request("/api/v1/cache/purge", { method: "POST" });

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

    const res = await app.request("/api/v1/cache/purge", { method: "POST" });

    expect(res.status).toBe(503);
    expect(mockFetch).not.toHaveBeenCalled();
    const json = await res.json();
    expect(json.error).toContain("not configured");
  });

  it("returns 502 with Cloudflare error body when upstream fails", async () => {
    mockFetch.mockResolvedValue(
      Response.json({ errors: [{ message: "bad zone" }] }, { status: 400 }),
    );
    const app = buildApp(configured);

    const res = await app.request("/api/v1/cache/purge", { method: "POST" });

    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error).toContain("Cloudflare purge failed");
    expect(json.error).toContain("bad zone");
  });
});

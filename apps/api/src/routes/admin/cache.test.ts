import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { Hono } from "hono";
import type { Context } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { appErrorInterceptor } from "../../orpc/app-error-interceptor.js";
import { buildApiContext } from "../../orpc/context.js";
import type { Variables } from "../../types.js";
import { adminCacheRouter } from "./cache";

// ---------------------------------------------------------------------------
// Test app
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();

// Mount the oRPC router directly (without the requireAdmin gate). AppErrors are
// bridged to ORPCErrors inside the router, so 4xx/5xx responses carry
// `{ message }`.
const handler = new OpenAPIHandler(adminCacheRouter, {
  interceptors: [appErrorInterceptor],
});

function buildApp(cloudflare: { apiToken: string; zoneId: string } | undefined) {
  const app = new Hono<{ Variables: Variables }>();
  app.use("*", async (c, next) => {
    c.set("io", { fetch: mockFetch } as never);
    c.set("config", { cloudflare } as never);
    c.set("user", { id: "a0000000-0001-4000-a000-000000000001" } as never);
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
  for (const path of ["/api/admin/v1/cache/status", "/api/admin/v1/cache/purge"]) {
    app.all(path, handle);
  }
  return app;
}

const configured = { apiToken: "token-abc", zoneId: "zone-xyz" };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /cache/status", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns configured=true when credentials are set", async () => {
    const app = buildApp(configured);
    const res = await app.request("/api/admin/v1/cache/status");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ configured: true });
  });

  it("returns configured=false when credentials are missing", async () => {
    const app = buildApp(undefined);
    const res = await app.request("/api/admin/v1/cache/status");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ configured: false });
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
    const json = await res.json();
    expect(json.message).toContain("not configured");
  });

  it("returns 502 without leaking the Cloudflare error body to the client", async () => {
    mockFetch.mockResolvedValue(
      Response.json({ errors: [{ message: "bad zone" }] }, { status: 400 }),
    );
    const app = buildApp(configured);

    const res = await app.request("/api/admin/v1/cache/purge", { method: "POST" });

    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.message).toContain("Cloudflare purge failed");
    // The upstream body is logged server-side, not reflected to the client.
    expect(json.message).not.toContain("bad zone");
  });
});

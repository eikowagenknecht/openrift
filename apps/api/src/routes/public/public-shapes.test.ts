import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "../../errors.js";
import { publicShapesRoute } from "./public-shapes";

function createApp(electric: { url?: string; secret?: string }) {
  return new Hono()
    .use("*", async (c, next) => {
      c.set("config", { electric } as never);
      await next();
    })
    .route("/api/v1", publicShapesRoute)
    .onError((err, c) => {
      if (err instanceof AppError) {
        return c.json({ error: err.message, code: err.code }, err.status as 400);
      }
      throw err;
    });
}

const originalFetch = globalThis.fetch;
let upstreamUrl: URL | null;

beforeEach(() => {
  upstreamUrl = null;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    upstreamUrl = new URL(String(input instanceof Request ? input.url : input));
    return Response.json([], {
      status: 200,
      headers: {
        "electric-handle": "handle-1",
        "electric-offset": "0_0",
        "content-encoding": "gzip",
        "cache-control": "public, max-age=60",
      },
    });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("GET /api/v1/public-shapes/printings", () => {
  it("returns 503 when Electric is not configured", async () => {
    const res = await createApp({}).request("/api/v1/public-shapes/printings?offset=-1");
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe("SERVICE_UNAVAILABLE");
  });

  it("pins the printings table + canonical_rank column set, with no where / params", async () => {
    const app = createApp({ url: "http://electric.internal:3000", secret: "s3cret" });
    const res = await app.request("/api/v1/public-shapes/printings?offset=-1");

    expect(res.status).toBe(200);
    expect(upstreamUrl?.pathname).toBe("/v1/shape");
    expect(upstreamUrl?.searchParams.get("table")).toBe("printings");
    expect(upstreamUrl?.searchParams.get("columns")).toContain("canonical_rank");
    // Public whole-table shape: no row filter, no per-user binding.
    expect(upstreamUrl?.searchParams.get("where")).toBeNull();
    expect(upstreamUrl?.searchParams.get("params[1]")).toBeNull();
    expect(upstreamUrl?.searchParams.get("secret")).toBe("s3cret");
  });

  it("a client cannot widen the shape by passing table/where/columns", async () => {
    const app = createApp({ url: "http://electric.internal:3000", secret: "s3cret" });
    await app.request(
      "/api/v1/public-shapes/printings?offset=0_0&table=users&where=1%3D1&columns=*",
    );

    expect(upstreamUrl?.searchParams.get("table")).toBe("printings");
    expect(upstreamUrl?.searchParams.get("where")).toBeNull();
    expect(upstreamUrl?.searchParams.get("columns")).toContain("canonical_rank");
  });

  it("forwards the sync-protocol position params", async () => {
    const app = createApp({ url: "http://electric.internal:3000", secret: "s3cret" });
    await app.request("/api/v1/public-shapes/printings?offset=0_0&handle=h1&live=true&cursor=c1");
    expect(upstreamUrl?.searchParams.get("offset")).toBe("0_0");
    expect(upstreamUrl?.searchParams.get("handle")).toBe("h1");
    expect(upstreamUrl?.searchParams.get("live")).toBe("true");
    expect(upstreamUrl?.searchParams.get("cursor")).toBe("c1");
  });

  it("strips hop headers and sets a public, shared-cacheable cache-control", async () => {
    const app = createApp({ url: "http://electric.internal:3000", secret: "s3cret" });
    const res = await app.request("/api/v1/public-shapes/printings?offset=-1");

    expect(res.headers.get("electric-handle")).toBe("handle-1");
    expect(res.headers.get("content-encoding")).toBeNull();
    const cacheControl = res.headers.get("cache-control") ?? "";
    expect(cacheControl).toContain("public");
    expect(cacheControl).not.toContain("no-store");
  });

  it("answers 204 when the upstream fetch is aborted by the client", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new DOMException("The connection was closed.", "AbortError");
    }) as typeof fetch;
    const app = createApp({ url: "http://electric.internal:3000", secret: "s3cret" });

    const res = await app.request("/api/v1/public-shapes/printings?offset=0_inf&live=true");
    expect(res.status).toBe(204);
  });
});

describe("GET /api/v1/public-shapes/cards", () => {
  it("pins the cards table and trims out norm_name / timestamps", async () => {
    const app = createApp({ url: "http://electric.internal:3000", secret: "s3cret" });
    await app.request("/api/v1/public-shapes/cards?offset=-1");

    expect(upstreamUrl?.searchParams.get("table")).toBe("cards");
    const columns = upstreamUrl?.searchParams.get("columns") ?? "";
    expect(columns).toContain("slug");
    expect(columns).not.toContain("norm_name");
    expect(columns).not.toContain("created_at");
  });
});

describe("GET /api/v1/public-shapes/markers", () => {
  it("pins the markers table", async () => {
    const app = createApp({ url: "http://electric.internal:3000", secret: "s3cret" });
    await app.request("/api/v1/public-shapes/markers?offset=-1");
    expect(upstreamUrl?.searchParams.get("table")).toBe("markers");
    expect(upstreamUrl?.searchParams.get("where")).toBeNull();
  });
});

describe("GET /api/v1/public-shapes/latest-prices", () => {
  it("pins the latest_printing_prices table + the 3 price columns, no where, no currency", async () => {
    const app = createApp({ url: "http://electric.internal:3000", secret: "s3cret" });
    await app.request("/api/v1/public-shapes/latest-prices?offset=-1");

    expect(upstreamUrl?.searchParams.get("table")).toBe("latest_printing_prices");
    const columns = upstreamUrl?.searchParams.get("columns") ?? "";
    expect(columns).toBe("printing_id,marketplace,headline_cents");
    // The client rebuilds the marketplace→currency map itself.
    expect(columns).not.toContain("currency");
    // Public whole-table shape: no row filter.
    expect(upstreamUrl?.searchParams.get("where")).toBeNull();
  });

  it("a client cannot widen the shape by passing table/columns", async () => {
    const app = createApp({ url: "http://electric.internal:3000", secret: "s3cret" });
    await app.request(
      "/api/v1/public-shapes/latest-prices?offset=0_0&table=users&columns=*&where=1%3D1",
    );

    expect(upstreamUrl?.searchParams.get("table")).toBe("latest_printing_prices");
    expect(upstreamUrl?.searchParams.get("columns")).toBe("printing_id,marketplace,headline_cents");
    expect(upstreamUrl?.searchParams.get("where")).toBeNull();
  });
});

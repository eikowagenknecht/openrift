import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "../../errors.js";
import { shapesRoute } from "./shapes";

const USER_ID = "a0000000-0001-4000-a000-000000000001";

function createApp(electric: { url?: string; secret?: string }) {
  return new Hono()
    .use("*", async (c, next) => {
      c.set("user", { id: USER_ID });
      c.set("config", { electric } as never);
      await next();
    })
    .route("/api/v1", shapesRoute)
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

describe("GET /api/v1/shapes/copies", () => {
  it("returns 503 when Electric is not configured", async () => {
    const res = await createApp({}).request("/api/v1/shapes/copies?offset=-1");
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe("SERVICE_UNAVAILABLE");
  });

  it("pins table, columns, viewer-scoped where clause, and secret server-side", async () => {
    const app = createApp({ url: "http://electric.internal:3000", secret: "s3cret" });
    const res = await app.request("/api/v1/shapes/copies?offset=-1");

    expect(res.status).toBe(200);
    expect(upstreamUrl).not.toBeNull();
    expect(upstreamUrl?.origin).toBe("http://electric.internal:3000");
    expect(upstreamUrl?.pathname).toBe("/v1/shape");
    expect(upstreamUrl?.searchParams.get("table")).toBe("copies");
    expect(upstreamUrl?.searchParams.get("columns")).toBe("id,collection_id,printing_id");
    expect(upstreamUrl?.searchParams.get("where")).toContain("collection_id IN");
    expect(upstreamUrl?.searchParams.get("params[1]")).toBe(USER_ID);
    expect(upstreamUrl?.searchParams.get("secret")).toBe("s3cret");
  });

  it("forwards only the sync-protocol position params — a client cannot widen its shape", async () => {
    const app = createApp({ url: "http://electric.internal:3000", secret: "s3cret" });
    await app.request(
      "/api/v1/shapes/copies?offset=0_0&handle=h1&live=true&cursor=c1&table=users&where=1%3D1&columns=*",
    );

    expect(upstreamUrl?.searchParams.get("offset")).toBe("0_0");
    expect(upstreamUrl?.searchParams.get("handle")).toBe("h1");
    expect(upstreamUrl?.searchParams.get("live")).toBe("true");
    expect(upstreamUrl?.searchParams.get("cursor")).toBe("c1");
    // The injection attempts are overwritten by the server-pinned values.
    expect(upstreamUrl?.searchParams.get("table")).toBe("copies");
    expect(upstreamUrl?.searchParams.get("where")).toContain("collection_id IN");
    expect(upstreamUrl?.searchParams.get("columns")).toBe("id,collection_id,printing_id");
  });

  it("passes Electric protocol headers through, strips hop headers, never caches", async () => {
    const app = createApp({ url: "http://electric.internal:3000", secret: "s3cret" });
    const res = await app.request("/api/v1/shapes/copies?offset=-1");

    expect(res.headers.get("electric-handle")).toBe("handle-1");
    expect(res.headers.get("electric-offset")).toBe("0_0");
    expect(res.headers.get("content-encoding")).toBeNull();
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });
});

describe("GET /api/v1/shapes/copies — client abort", () => {
  // Regression: rotating live long-polls abort their previous request; the
  // abort propagates to the upstream fetch, whose AbortError must settle as
  // a quiet 204 instead of bubbling up as an unhandled API error.
  it("answers 204 when the upstream fetch is aborted by the client", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new DOMException("The connection was closed.", "AbortError");
    }) as typeof fetch;
    const app = createApp({ url: "http://electric.internal:3000", secret: "s3cret" });

    const res = await app.request("/api/v1/shapes/copies?offset=0_inf&live=true");
    expect(res.status).toBe(204);
  });
});

describe("GET /api/v1/shapes/collections", () => {
  it("pins the collections table and the server-chosen column set", async () => {
    const app = createApp({ url: "http://electric.internal:3000", secret: "s3cret" });
    const res = await app.request("/api/v1/shapes/collections?offset=-1");

    expect(res.status).toBe(200);
    expect(upstreamUrl?.searchParams.get("table")).toBe("collections");
    expect(upstreamUrl?.searchParams.get("columns")).toBe(
      "id,group_id,name,description,is_inbox,sort_order",
    );
    expect(upstreamUrl?.searchParams.get("where")).toContain("user_id = $1");
    expect(upstreamUrl?.searchParams.get("params[1]")).toBe(USER_ID);
  });
});

describe("GET /api/v1/shapes/lists", () => {
  it("pins the lists table, the server-chosen column set, and owner-only scoping", async () => {
    const app = createApp({ url: "http://electric.internal:3000", secret: "s3cret" });
    const res = await app.request("/api/v1/shapes/lists?offset=-1");

    expect(res.status).toBe(200);
    expect(upstreamUrl?.searchParams.get("table")).toBe("lists");
    expect(upstreamUrl?.searchParams.get("columns")).toBe(
      "id,name,intent,kind,default_price_pref,default_price_absolute_cents,default_trade_type,currency,sort_order",
    );
    expect(upstreamUrl?.searchParams.get("where")).toBe("user_id = $1");
    expect(upstreamUrl?.searchParams.get("params[1]")).toBe(USER_ID);
  });
});

describe("GET /api/v1/shapes/list-entries", () => {
  it("pins the list_entries table, the server-chosen column set, and owner-only scoping", async () => {
    const app = createApp({ url: "http://electric.internal:3000", secret: "s3cret" });
    const res = await app.request("/api/v1/shapes/list-entries?offset=-1");

    expect(res.status).toBe(200);
    expect(upstreamUrl?.searchParams.get("table")).toBe("list_entries");
    expect(upstreamUrl?.searchParams.get("columns")).toBe(
      "id,list_id,kind,card_id,printing_id,copy_id,quantity,price_pref,price_absolute_cents,trade_type",
    );
    expect(upstreamUrl?.searchParams.get("where")).toBe("user_id = $1");
    expect(upstreamUrl?.searchParams.get("params[1]")).toBe(USER_ID);
  });
});

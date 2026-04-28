import { describe, expect, it } from "vitest";

import { applyPageCacheControl } from "./page-cache";

const PUBLIC = "public, max-age=300, stale-while-revalidate=3600";
const PRIVATE = "private, no-cache";

function htmlResponse(extraHeaders: Record<string, string> = {}, status = 200): Response {
  return new Response("<html></html>", {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
      ...extraHeaders,
    },
  });
}

function getRequest(
  path: string,
  extraHeaders: Record<string, string> = {},
  method = "GET",
): Request {
  return new Request(`https://example.com${path}`, {
    method,
    headers: { ...extraHeaders },
  });
}

describe("applyPageCacheControl", () => {
  it("emits public cache headers for anonymous GETs on cacheable public pages", () => {
    const result = applyPageCacheControl(getRequest("/cards"), htmlResponse());
    expect(result.headers.get("Cache-Control")).toBe(PUBLIC);
  });

  it("emits the same public cache headers on the homepage", () => {
    const result = applyPageCacheControl(getRequest("/"), htmlResponse());
    expect(result.headers.get("Cache-Control")).toBe(PUBLIC);
  });

  it("caches card and set detail pages via prefix match", () => {
    const cardDetail = applyPageCacheControl(getRequest("/cards/lux"), htmlResponse());
    const setDetail = applyPageCacheControl(getRequest("/sets/origins"), htmlResponse());
    expect(cardDetail.headers.get("Cache-Control")).toBe(PUBLIC);
    expect(setDetail.headers.get("Cache-Control")).toBe(PUBLIC);
  });

  it("applies cache headers to HEAD requests too", () => {
    const result = applyPageCacheControl(getRequest("/cards", {}, "HEAD"), htmlResponse());
    expect(result.headers.get("Cache-Control")).toBe(PUBLIC);
  });

  it("forces private no-cache for logged-in users on public pages", () => {
    const result = applyPageCacheControl(
      getRequest("/cards", { cookie: "better-auth.session_token=abc123" }),
      htmlResponse(),
    );
    expect(result.headers.get("Cache-Control")).toBe(PRIVATE);
  });

  it("matches the __Secure- prefixed session cookie too", () => {
    const result = applyPageCacheControl(
      getRequest("/cards", { cookie: "__Secure-better-auth.session_token=abc123" }),
      htmlResponse(),
    );
    expect(result.headers.get("Cache-Control")).toBe(PRIVATE);
  });

  it("forces private no-cache on non-cacheable paths like /login", () => {
    const result = applyPageCacheControl(getRequest("/login"), htmlResponse());
    expect(result.headers.get("Cache-Control")).toBe(PRIVATE);
  });

  it("forces private no-cache when the response carries Set-Cookie", () => {
    const result = applyPageCacheControl(
      getRequest("/cards"),
      htmlResponse({ "Set-Cookie": "foo=bar" }),
    );
    expect(result.headers.get("Cache-Control")).toBe(PRIVATE);
  });

  it("forces private no-cache on non-200 responses so errors are not cached", () => {
    const result = applyPageCacheControl(getRequest("/cards"), htmlResponse({}, 500));
    expect(result.headers.get("Cache-Control")).toBe(PRIVATE);
  });

  it("forces private no-cache on non-GET, non-HEAD HTML responses", () => {
    const result = applyPageCacheControl(getRequest("/cards", {}, "POST"), htmlResponse());
    expect(result.headers.get("Cache-Control")).toBe(PRIVATE);
  });

  it("leaves non-HTML responses alone so JSON server-fn responses are untouched", () => {
    const response = new Response("{}", {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-cache" },
    });
    const result = applyPageCacheControl(getRequest("/cards"), response);
    expect(result).toBe(response);
    expect(result.headers.get("Cache-Control")).toBe("no-cache");
  });

  it("replaces any existing Cache-Control rather than appending", () => {
    // Regression test for the double-header bug: nginx used to add a second
    // Cache-Control on top of the one this wrapper set, which broke CF caching.
    // Proves Headers.set() replaces and the response has exactly one value.
    const result = applyPageCacheControl(getRequest("/cards"), htmlResponse());
    const allHeaders = [...result.headers.entries()].filter(
      ([key]) => key.toLowerCase() === "cache-control",
    );
    expect(allHeaders).toHaveLength(1);
    expect(allHeaders[0]?.[1]).toBe(PUBLIC);
  });

  it("emits Link preload headers on 200 HTML responses for CF Early Hints", () => {
    const result = applyPageCacheControl(getRequest("/cards"), htmlResponse());
    const link = result.headers.get("Link") ?? "";
    expect(link).toMatch(/rel=preload; as=style/);
    expect(link).toMatch(/rel=preload; as=font; type="font\/woff2"; crossorigin/);
  });

  it("emits Link preload headers on private HTML routes too", () => {
    // CF Early Hints caches Link headers independently of page cacheability,
    // so logged-in views also benefit on subsequent visits.
    const result = applyPageCacheControl(
      getRequest("/cards", { cookie: "better-auth.session_token=abc" }),
      htmlResponse(),
    );
    expect(result.headers.get("Link")).toMatch(/rel=preload/);
  });

  it("does not emit Link preload headers on non-200 HTML responses", () => {
    const result = applyPageCacheControl(getRequest("/cards"), htmlResponse({}, 500));
    expect(result.headers.get("Link")).toBeNull();
  });

  it("does not emit Link preload headers on non-HTML responses", () => {
    const response = new Response("{}", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
    const result = applyPageCacheControl(getRequest("/cards"), response);
    expect(result.headers.get("Link")).toBeNull();
  });
});

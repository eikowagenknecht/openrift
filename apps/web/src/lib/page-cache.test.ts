import { describe, expect, it } from "vitest";

import { maybeApplyPublicCache } from "./page-cache";

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

describe("maybeApplyPublicCache", () => {
  it("rewrites Cache-Control for anonymous GET to a cacheable public page", () => {
    const result = maybeApplyPublicCache(getRequest("/cards"), htmlResponse());
    expect(result.headers.get("Cache-Control")).toBe(
      "public, max-age=60, stale-while-revalidate=300",
    );
  });

  it("caches card and set detail pages via prefix match", () => {
    const cardDetail = maybeApplyPublicCache(getRequest("/cards/lux"), htmlResponse());
    const setDetail = maybeApplyPublicCache(getRequest("/sets/origins"), htmlResponse());
    expect(cardDetail.headers.get("Cache-Control")).toBe(
      "public, max-age=60, stale-while-revalidate=300",
    );
    expect(setDetail.headers.get("Cache-Control")).toBe(
      "public, max-age=60, stale-while-revalidate=300",
    );
  });

  it("leaves logged-in responses alone so personalized nav is not cached", () => {
    const request = getRequest("/cards", { cookie: "better-auth.session_token=abc123" });
    const result = maybeApplyPublicCache(request, htmlResponse());
    expect(result.headers.get("Cache-Control")).toBe("no-cache");
  });

  it("matches the __Secure- prefixed session cookie too", () => {
    const request = getRequest("/cards", {
      cookie: "__Secure-better-auth.session_token=abc123",
    });
    const result = maybeApplyPublicCache(request, htmlResponse());
    expect(result.headers.get("Cache-Control")).toBe("no-cache");
  });

  it("leaves non-cacheable paths alone", () => {
    const result = maybeApplyPublicCache(getRequest("/login"), htmlResponse());
    expect(result.headers.get("Cache-Control")).toBe("no-cache");
  });

  it("leaves responses with Set-Cookie alone to avoid caching session-bearing responses", () => {
    const response = htmlResponse({ "Set-Cookie": "foo=bar" });
    const result = maybeApplyPublicCache(getRequest("/cards"), response);
    expect(result.headers.get("Cache-Control")).toBe("no-cache");
  });

  it("leaves non-HTML responses alone", () => {
    const response = new Response("{}", {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-cache" },
    });
    const result = maybeApplyPublicCache(getRequest("/cards"), response);
    expect(result.headers.get("Cache-Control")).toBe("no-cache");
  });

  it("leaves non-200 responses alone", () => {
    const result = maybeApplyPublicCache(getRequest("/cards"), htmlResponse({}, 500));
    expect(result.headers.get("Cache-Control")).toBe("no-cache");
  });

  it("leaves non-GET, non-HEAD methods alone", () => {
    const result = maybeApplyPublicCache(getRequest("/cards", {}, "POST"), htmlResponse());
    expect(result.headers.get("Cache-Control")).toBe("no-cache");
  });

  it("applies cache headers to HEAD requests too", () => {
    const result = maybeApplyPublicCache(getRequest("/cards", {}, "HEAD"), htmlResponse());
    expect(result.headers.get("Cache-Control")).toBe(
      "public, max-age=60, stale-while-revalidate=300",
    );
  });

  it("returns the original response object when not rewriting", () => {
    const response = htmlResponse();
    const result = maybeApplyPublicCache(getRequest("/login"), response);
    expect(result).toBe(response);
  });
});

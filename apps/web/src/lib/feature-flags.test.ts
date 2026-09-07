import type { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server-cache", async () => {
  const { QueryClient: QC } = await import("@tanstack/react-query");
  return { serverCache: new QC({ defaultOptions: { queries: { retry: false } } }) };
});

// Must import after mocks so they take effect.
const { loadFeatureFlags } = await import("./feature-flags");
const { serverCache } = (await import("./server-cache")) as { serverCache: QueryClient };

const SESSION_COOKIE = "better-auth.session_token=abc123; theme=dark";
const NO_SESSION_COOKIE = "theme=dark";

// The oRPC OpenAPI client reads the response content-type and streams the
// body, so the mock must be a real Response, not a hand-rolled stub.
function mockFlagsResponse(flags: Record<string, boolean>) {
  return Response.json({ flags });
}

// oRPC's fetch link may call fetch as `fetch(url, init)` or `fetch(request)`.
// Normalize both into { url, headers } so assertions don't depend on the shape.
function readFetchCall(call: unknown[]): { url: string; headers: Headers } {
  const [first, second] = call;
  if (first instanceof Request) {
    return { url: first.url, headers: first.headers };
  }
  const init = (second ?? {}) as { headers?: HeadersInit };
  return { url: String(first), headers: new Headers(init.headers) };
}

describe("loadFeatureFlags", () => {
  beforeEach(() => {
    serverCache.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("forwards the session cookie to the API when authenticated", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockFlagsResponse({ "beta-flag": true }));
    vi.stubGlobal("fetch", fetchMock);

    const flags = await loadFeatureFlags(SESSION_COOKIE);

    expect(flags).toEqual({ "beta-flag": true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { url, headers } = readFetchCall(fetchMock.mock.calls[0]);
    expect(url).toBe("http://localhost:3000/api/v1/feature-flags");
    expect(headers.get("cookie")).toBe(SESSION_COOKIE);
  });

  it("bypasses the shared serverCache for authenticated users so overrides don't leak between accounts", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockFlagsResponse({ a: true }))
      .mockResolvedValueOnce(mockFlagsResponse({ b: true }));
    vi.stubGlobal("fetch", fetchMock);

    const first = await loadFeatureFlags("better-auth.session_token=user-a");
    const second = await loadFeatureFlags("better-auth.session_token=user-b");

    expect(first).toEqual({ a: true });
    expect(second).toEqual({ b: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not forward cookies when no session cookie is present", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockFlagsResponse({ "public-flag": true }));
    vi.stubGlobal("fetch", fetchMock);

    await loadFeatureFlags(NO_SESSION_COOKIE);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { headers } = readFetchCall(fetchMock.mock.calls[0]);
    expect(headers.get("cookie")).toBeNull();
  });

  it("coalesces concurrent anonymous requests via serverCache", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockFlagsResponse({ "public-flag": true }));
    vi.stubGlobal("fetch", fetchMock);

    const [a, b] = await Promise.all([loadFeatureFlags(""), loadFeatureFlags("")]);

    expect(a).toEqual({ "public-flag": true });
    expect(b).toEqual({ "public-flag": true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

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

// The hc client calls global fetch with (url, { headers: Headers, ... }); mock at
// that boundary so the test exercises serverApiClient's real cookie forwarding.
function mockFlagsResponse(flags: Record<string, boolean>) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    url: "http://localhost:3000/api/v1/feature-flags",
    json: async () => ({ flags }),
    text: async () => JSON.stringify({ flags }),
  } as Response;
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
    const [url, init] = fetchMock.mock.calls[0] as [string, { headers: Headers }];
    expect(url).toBe("http://localhost:3000/api/v1/feature-flags");
    expect(init.headers.get("cookie")).toBe(SESSION_COOKIE);
  });

  it("bypasses the shared serverCache for authenticated users", async () => {
    // Two authenticated requests with different session cookies must each hit
    // the API — otherwise user A's overrides would leak to user B.
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
    // Anonymous path calls the API with no cookie at all (not the non-session cookie).
    const [, init] = fetchMock.mock.calls[0] as [string, { headers: Headers }];
    expect(init.headers.get("cookie")).toBeNull();
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

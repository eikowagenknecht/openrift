import type { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, beforeEach, vi } from "vitest";

const fetchApiJsonMock = vi.fn();

vi.mock("@/lib/server-fns/fetch-api", () => ({
  fetchApiJson: (opts: unknown) => fetchApiJsonMock(opts),
}));

vi.mock("@/lib/server-cache", async () => {
  const { QueryClient: QC } = await import("@tanstack/react-query");
  return { serverCache: new QC({ defaultOptions: { queries: { retry: false } } }) };
});

// Must import after mocks so they take effect.
const { loadFeatureFlags } = await import("./feature-flags");
const { serverCache } = (await import("./server-cache")) as { serverCache: QueryClient };

const SESSION_COOKIE = "better-auth.session_token=abc123; theme=dark";
const NO_SESSION_COOKIE = "theme=dark";

describe("loadFeatureFlags", () => {
  beforeEach(() => {
    fetchApiJsonMock.mockReset();
    serverCache.clear();
  });

  it("forwards the session cookie to the API when authenticated", async () => {
    fetchApiJsonMock.mockResolvedValue({ items: { "beta-flag": true } });

    const flags = await loadFeatureFlags(SESSION_COOKIE);

    expect(flags).toEqual({ "beta-flag": true });
    expect(fetchApiJsonMock).toHaveBeenCalledTimes(1);
    expect(fetchApiJsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/api/v1/feature-flags",
        cookie: SESSION_COOKIE,
      }),
    );
  });

  it("bypasses the shared serverCache for authenticated users", async () => {
    // Two authenticated requests with different session cookies must each hit
    // the API — otherwise user A's overrides would leak to user B.
    fetchApiJsonMock
      .mockResolvedValueOnce({ items: { a: true } })
      .mockResolvedValueOnce({ items: { b: true } });

    const first = await loadFeatureFlags("better-auth.session_token=user-a");
    const second = await loadFeatureFlags("better-auth.session_token=user-b");

    expect(first).toEqual({ a: true });
    expect(second).toEqual({ b: true });
    expect(fetchApiJsonMock).toHaveBeenCalledTimes(2);
  });

  it("does not forward cookies when no session cookie is present", async () => {
    fetchApiJsonMock.mockResolvedValue({ items: { "public-flag": true } });

    await loadFeatureFlags(NO_SESSION_COOKIE);

    expect(fetchApiJsonMock).toHaveBeenCalledTimes(1);
    expect(fetchApiJsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/api/v1/feature-flags",
        cookie: undefined,
      }),
    );
  });

  it("coalesces concurrent anonymous requests via serverCache", async () => {
    fetchApiJsonMock.mockResolvedValue({ items: { "public-flag": true } });

    const [a, b] = await Promise.all([loadFeatureFlags(""), loadFeatureFlags("")]);

    expect(a).toEqual({ "public-flag": true });
    expect(b).toEqual({ "public-flag": true });
    expect(fetchApiJsonMock).toHaveBeenCalledTimes(1);
  });
});

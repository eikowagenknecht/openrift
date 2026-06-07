import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain = {
      handler: (fn: (...args: unknown[]) => unknown) => fn,
      validator: () => chain,
    };
    return chain;
  },
}));

vi.mock("@/lib/server-cache", async () => {
  const { QueryClient } = await import("@tanstack/react-query");
  return { serverCache: new QueryClient({ defaultOptions: { queries: { retry: false } } }) };
});

const { serverCache } = await import("@/lib/server-cache");
const { publicSetDetailQueryOptions } = await import("./use-public-sets");

describe("publicSetDetailQueryOptions", () => {
  beforeEach(() => {
    serverCache.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    serverCache.clear();
  });

  it("throws Error('NOT_FOUND') when the API returns 404", async () => {
    // callApi accepts the 404 (acceptStatuses) and returns it; the handler maps
    // it to NOT_FOUND. Mock global fetch — the boundary the hc client calls.
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(null, { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    const { queryFn } = publicSetDetailQueryOptions("missing");
    await expect((queryFn as () => Promise<unknown>)()).rejects.toThrow("NOT_FOUND");

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe("http://localhost:3000/api/v1/sets/missing");
  });
});

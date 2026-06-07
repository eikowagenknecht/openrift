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
const { cardDetailQueryOptions } = await import("./use-card-detail");

describe("cardDetailQueryOptions", () => {
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

    const { queryFn } = cardDetailQueryOptions("does-not-exist");
    expect(queryFn).toBeDefined();
    await expect(
      // The vitest queryFn signature has a context arg; tests don't need it.
      (queryFn as () => Promise<unknown>)(),
    ).rejects.toThrow("NOT_FOUND");

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe("http://localhost:3000/api/v1/cards/does-not-exist");
  });

  it("returns the parsed payload on 200", async () => {
    const payload = { card: { id: "x", slug: "x" }, printings: [], sets: [], prices: {} };
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json(payload));
    vi.stubGlobal("fetch", fetchMock);

    const { queryFn } = cardDetailQueryOptions("x");
    const result = await (queryFn as () => Promise<unknown>)();
    expect(result).toEqual(payload);
  });
});

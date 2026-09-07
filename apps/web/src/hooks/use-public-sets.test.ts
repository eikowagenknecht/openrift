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
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          { defined: true, code: "NOT_FOUND", status: 404, message: "Not Found" },
          { status: 404 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { queryFn } = publicSetDetailQueryOptions("missing");
    await expect((queryFn as () => Promise<unknown>)()).rejects.toThrow("NOT_FOUND");

    // oRPC's fetch link may call fetch(url, init) or fetch(request); read the URL
    // from whichever shape so the assertion isn't coupled to the convention.
    const [first] = fetchMock.mock.calls[0] as [string | Request];
    const calledUrl = first instanceof Request ? first.url : String(first);
    expect(calledUrl).toBe("http://localhost:3000/api/v1/sets/missing");
  });
});

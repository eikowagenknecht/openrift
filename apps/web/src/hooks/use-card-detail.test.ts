import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain = {
      handler: (fn: (...args: unknown[]) => unknown) => fn,
      inputValidator: () => chain,
    };
    return chain;
  },
}));

vi.mock("@/lib/server-cache", async () => {
  const { QueryClient } = await import("@tanstack/react-query");
  return { serverCache: new QueryClient({ defaultOptions: { queries: { retry: false } } }) };
});

const fetchApiMock = vi.fn();
vi.mock("@/lib/server-fns/fetch-api", () => ({
  fetchApi: (...args: unknown[]) => fetchApiMock(...args),
}));

const { serverCache } = await import("@/lib/server-cache");
const { cardDetailQueryOptions } = await import("./use-card-detail");

describe("cardDetailQueryOptions", () => {
  beforeEach(() => {
    fetchApiMock.mockReset();
    serverCache.clear();
  });

  afterEach(() => {
    serverCache.clear();
  });

  it("throws Error('NOT_FOUND') when the API returns 404", async () => {
    fetchApiMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
    const { queryFn } = cardDetailQueryOptions("does-not-exist");
    expect(queryFn).toBeDefined();
    await expect(
      // The vitest queryFn signature has a context arg; tests don't need it.
      (queryFn as () => Promise<unknown>)(),
    ).rejects.toThrow("NOT_FOUND");
    expect(fetchApiMock).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/api/v1/cards/does-not-exist",
        acceptStatuses: [404],
      }),
    );
  });

  it("returns the parsed payload on 200", async () => {
    const payload = { card: { id: "x", slug: "x" }, printings: [], sets: [], prices: {} };
    fetchApiMock.mockResolvedValueOnce(Response.json(payload));
    const { queryFn } = cardDetailQueryOptions("x");
    const result = await (queryFn as () => Promise<unknown>)();
    expect(result).toEqual(payload);
  });
});

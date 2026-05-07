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
const fetchApiJsonMock = vi.fn();
vi.mock("@/lib/server-fns/fetch-api", () => ({
  fetchApi: (...args: unknown[]) => fetchApiMock(...args),
  fetchApiJson: (...args: unknown[]) => fetchApiJsonMock(...args),
}));

const { serverCache } = await import("@/lib/server-cache");
const { publicSetDetailQueryOptions } = await import("./use-public-sets");

describe("publicSetDetailQueryOptions", () => {
  beforeEach(() => {
    fetchApiMock.mockReset();
    fetchApiJsonMock.mockReset();
    serverCache.clear();
  });

  afterEach(() => {
    serverCache.clear();
  });

  it("throws Error('NOT_FOUND') when the API returns 404", async () => {
    fetchApiMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
    const { queryFn } = publicSetDetailQueryOptions("missing");
    await expect((queryFn as () => Promise<unknown>)()).rejects.toThrow("NOT_FOUND");
    expect(fetchApiMock).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/api/v1/sets/missing",
        acceptStatuses: [404],
      }),
    );
  });
});

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { createElement } from "react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// No TanStack Start server in vitest/jsdom; run the handler directly with a
// synthetic context so `context.cookie` reads work without withCookies.
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain = {
      handler:
        (fn: (input: Record<string, unknown>) => unknown) => (input?: Record<string, unknown>) =>
          fn({ context: { cookie: "" }, ...input }),
      middleware: () => chain,
      validator: () => chain,
    };
    return chain;
  },
  createMiddleware: () => {
    const chain = {
      server: () => chain,
      client: () => chain,
    };
    return chain;
  },
}));

vi.mock("@/lib/server-cache", async () => {
  const { QueryClient: QC } = await import("@tanstack/react-query");
  return {
    serverCache: new QC({
      defaultOptions: { queries: { retry: false, staleTime: 60 * 1000 } },
    }),
  };
});

const list = vi.fn();
const create = vi.fn();
const resyncContents = vi.fn();
const update = vi.fn();
const remove = vi.fn();

vi.mock("@/lib/server-fns/orpc-client", () => ({
  apiOrpcClient: () => ({ list, create, resyncContents, update, remove }),
}));

const { serverCache } = await import("@/lib/server-cache");
const { productsListQueryOptions, useCreateProduct, useUpdateProduct } =
  await import("./use-products");

const PRODUCT = {
  id: "p1",
  slug: "unl-pre-rift-vi",
  name: "Unleashed Pre-Rift Kit – Vi",
  description: null,
  createdAt: "2026-07-15T00:00:00Z",
  updatedAt: "2026-07-15T00:00:00Z",
  printingCount: 16,
  cardTotal: 16,
};

const runListQuery = () => (productsListQueryOptions.queryFn as () => Promise<unknown>)();

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children);
  };
}

describe("products server cache invalidation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serverCache.clear();
  });

  afterEach(() => {
    serverCache.clear();
  });

  it("serves the list from the server cache while fresh", async () => {
    list.mockResolvedValue({ products: [] });

    await expect(runListQuery()).resolves.toEqual({ products: [] });
    await expect(runListQuery()).resolves.toEqual({ products: [] });

    expect(list).toHaveBeenCalledTimes(1);
  });

  it("busts the server cache on create so the next list read is fresh", async () => {
    list.mockResolvedValueOnce({ products: [] }).mockResolvedValue({ products: [PRODUCT] });
    create.mockResolvedValue({ product: PRODUCT });

    await expect(runListQuery()).resolves.toEqual({ products: [] });

    const { result } = renderHook(() => useCreateProduct(), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.mutateAsync({
        slug: PRODUCT.slug,
        name: PRODUCT.name,
        description: null,
        listId: "list-1",
      });
    });

    await expect(runListQuery()).resolves.toEqual({ products: [PRODUCT] });
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("busts the server cache on metadata update", async () => {
    const renamed = { ...PRODUCT, name: "Renamed" };
    list.mockResolvedValueOnce({ products: [PRODUCT] }).mockResolvedValue({ products: [renamed] });
    update.mockResolvedValue(undefined);

    await expect(runListQuery()).resolves.toEqual({ products: [PRODUCT] });

    const { result } = renderHook(() => useUpdateProduct(), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.mutateAsync({ id: PRODUCT.id, name: "Renamed" });
    });

    await expect(runListQuery()).resolves.toEqual({ products: [renamed] });
    expect(list).toHaveBeenCalledTimes(2);
  });
});

import type { TradeListBulkAddResponse, TradeListResponse } from "@openrift/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain = {
      handler:
        (fn: (args: { context: { cookie: string }; data: unknown }) => unknown) =>
        (args?: { data?: unknown }) =>
          fn({ context: { cookie: "" }, data: args?.data }),
      middleware: () => chain,
      inputValidator: () => chain,
    };
    return chain;
  },
  createMiddleware: () => {
    const chain = { server: () => chain };
    return chain;
  },
}));

const fetchApiJsonMock = vi.fn();
const fetchApiMock = vi.fn();

vi.mock("@/lib/server-fns/fetch-api", () => ({
  fetchApi: fetchApiMock,
  fetchApiJson: fetchApiJsonMock,
}));

vi.mock("@/lib/server-fns/middleware", () => ({
  withCookies: () => {},
}));

vi.mock("@/lib/auth-session", () => ({
  useRequiredUserId: () => "test-user-id",
  useUserId: () => "test-user-id",
}));

const {
  useAddCopiesToTradeList,
  useCreateTradeList,
  useDeleteTradeList,
  useRemoveTradeListItem,
  useUpdateTradeList,
} = await import("./use-trade-lists");

function makeClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const invalidateSpy = vi.spyOn(client, "invalidateQueries");
  return { client, invalidateSpy };
}

function wrap(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

const TRADE_LIST: TradeListResponse = {
  id: "tl-1",
  name: "Trades",
  rules: null,
  shareToken: null,
  createdAt: "2026-05-12T00:00:00Z",
  updatedAt: "2026-05-12T00:00:00Z",
};

describe("useCreateTradeList", () => {
  it("invalidates the trade-lists list key on success", async () => {
    fetchApiJsonMock.mockResolvedValueOnce(TRADE_LIST);
    const { client, invalidateSpy } = makeClient();
    const { result } = renderHook(() => useCreateTradeList(), { wrapper: wrap(client) });

    await act(async () => {
      await result.current.mutateAsync({ name: "Trades" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["trade-lists", "test-user-id"],
    });
  });
});

describe("useUpdateTradeList", () => {
  it("invalidates both list and detail keys", async () => {
    fetchApiJsonMock.mockResolvedValueOnce({ ...TRADE_LIST, name: "Renamed" });
    const { client, invalidateSpy } = makeClient();
    const { result } = renderHook(() => useUpdateTradeList(), { wrapper: wrap(client) });

    await act(async () => {
      await result.current.mutateAsync({ tradeListId: "tl-1", name: "Renamed" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["trade-lists", "test-user-id"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["trade-lists", "test-user-id", "tl-1"],
    });
  });
});

describe("useDeleteTradeList", () => {
  it("invalidates the list key on success", async () => {
    fetchApiMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const { client, invalidateSpy } = makeClient();
    const { result } = renderHook(() => useDeleteTradeList(), { wrapper: wrap(client) });

    await act(async () => {
      await result.current.mutateAsync("tl-1");
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["trade-lists", "test-user-id"],
    });
  });
});

describe("useAddCopiesToTradeList", () => {
  it("forwards copyIds to the bulk endpoint and reports added/skipped", async () => {
    const response: TradeListBulkAddResponse = { added: 2, skipped: 1 };
    fetchApiJsonMock.mockResolvedValueOnce(response);
    const { client, invalidateSpy } = makeClient();
    const { result } = renderHook(() => useAddCopiesToTradeList(), { wrapper: wrap(client) });

    await act(async () => {
      const data = await result.current.mutateAsync({
        tradeListId: "tl-1",
        copyIds: ["c1", "c2", "c3"],
      });
      expect(data).toEqual(response);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["trade-lists", "test-user-id"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["trade-lists", "test-user-id", "tl-1"],
    });
  });
});

describe("useRemoveTradeListItem", () => {
  it("invalidates list and detail on success", async () => {
    fetchApiMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const { client, invalidateSpy } = makeClient();
    const { result } = renderHook(() => useRemoveTradeListItem(), { wrapper: wrap(client) });

    await act(async () => {
      await result.current.mutateAsync({ tradeListId: "tl-1", itemId: "i-1" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["trade-lists", "test-user-id"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["trade-lists", "test-user-id", "tl-1"],
    });
  });
});

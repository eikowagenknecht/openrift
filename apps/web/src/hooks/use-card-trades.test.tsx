import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { session, serverFnCalls } = vi.hoisted(() => ({
  session: { userId: "test-user-id" as string | null },
  /** Every payload handed to a mocked server function, newest last. */
  serverFnCalls: [] as unknown[],
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain = {
      handler: () => async (input: unknown) => {
        serverFnCalls.push(input);
        return null;
      },
      middleware: () => chain,
      validator: () => chain,
    };
    return chain;
  },
  createMiddleware: () => {
    const chain = { server: () => chain };
    return chain;
  },
}));

vi.mock("@/lib/server-fns/middleware", () => ({
  withCookies: () => {},
}));

vi.mock("@/lib/server-fns/orpc-client", () => ({
  apiOrpcClient: () => ({}),
}));

vi.mock("@/lib/auth-session", () => ({
  useRequiredUserId: () => "test-user-id",
  useUserId: () => session.userId,
  sessionQueryOptions: () => ({ queryKey: ["session"] }),
}));

afterEach(() => {
  session.userId = "test-user-id";
  serverFnCalls.length = 0;
});

const { useAcceptTrade, useCancelTrade, useLiveTradesByPrinting, useSetTradeQuantity } =
  await import("./use-card-trades");

function wrap(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function makeClient() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = vi.spyOn(client, "invalidateQueries");
  return { client, invalidateSpy };
}

// Regression: useSetTradeQuantity / useCancelTrade are mounted by
// shared-list-content, which renders on the public `/lists/share/$token`
// route. Before this fix they called useRequiredUserId() at hook-init time, so
// a logged-out visitor opening a shared list crashed the route with
// "useRequiredUserId() called without an authenticated session". The mutation
// only ever fires in authenticated friend-group request mode, so the hooks
// must tolerate a null session at mount.
describe("trade mutation hooks tolerate an unauthenticated session at mount", () => {
  it("useSetTradeQuantity does not throw when no session is cached", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    expect(() => renderHook(() => useSetTradeQuantity(), { wrapper: wrap(client) })).not.toThrow();
  });

  it("useCancelTrade does not throw when no session is cached", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    expect(() => renderHook(() => useCancelTrade(), { wrapper: wrap(client) })).not.toThrow();
  });
});

// Regression: trade mutations pin/release the per-copy `reserved` flag, but
// only invalidated the trades (and group-matches) keys. The copies feed and
// any list containing that copy went stale after every accept, cancel, or
// sync, so Reserved badges on /collections and list pages kept showing the
// pre-trade state until an unrelated refetch happened to land.
describe("trade mutations invalidate the copies and lists caches", () => {
  it("useAcceptTrade invalidates trades, copies, lists, and the group's matches", async () => {
    const { client, invalidateSpy } = makeClient();
    const { result } = renderHook(() => useAcceptTrade(), { wrapper: wrap(client) });

    await act(async () => {
      await result.current.mutateAsync({ tradeId: "trade-1", groupSlug: "grp-1" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["trades", "test-user-id"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["copies", "test-user-id"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["copies-collection", "test-user-id"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["lists", "test-user-id"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["friend-groups", "test-user-id", "grp-1", "matches"],
    });
  });
});

// The giver may name the exact copies an accept promises. The ids have to reach
// the server function untouched: drop them and the accept silently falls back
// to the server's own pin order, so the giver's choice in the picker would be
// thrown away without any visible sign.
describe("useAcceptTrade carries the giver's copy choice", () => {
  it("passes copyIds through to the accept server function", async () => {
    const { client } = makeClient();
    const { result } = renderHook(() => useAcceptTrade(), { wrapper: wrap(client) });

    await act(async () => {
      await result.current.mutateAsync({
        tradeId: "trade-1",
        groupSlug: "grp-1",
        copyIds: ["copy-a", "copy-b"],
      });
    });

    expect(serverFnCalls.at(-1)).toEqual({
      data: { tradeId: "trade-1", copyIds: ["copy-a", "copy-b"] },
    });
  });

  it("omits copyIds when the caller made no choice, so the server picks", async () => {
    const { client } = makeClient();
    const { result } = renderHook(() => useAcceptTrade(), { wrapper: wrap(client) });

    await act(async () => {
      await result.current.mutateAsync({ tradeId: "trade-1" });
    });

    expect(serverFnCalls.at(-1)).toEqual({ data: { tradeId: "trade-1", copyIds: undefined } });
  });
});

// The card browsers mount useLiveTradesByPrinting once per visible cell.
// refetchInterval is per-observer in query-core, so copying useUserTrades'
// 30s poll here would arm one timer per card on screen instead of one per app.
describe("useLiveTradesByPrinting", () => {
  function optionsFor(client: QueryClient) {
    const query = client
      .getQueryCache()
      .find({ queryKey: ["trades", "test-user-id", "live-by-printing"] });
    return query?.observers[0]?.options;
  }

  it("caches under the trades prefix and does not poll", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderHook(() => useLiveTradesByPrinting(), { wrapper: wrap(client) });

    const options = optionsFor(client);
    expect(options).toBeDefined();
    expect(options?.refetchInterval).toBeUndefined();
    expect(options?.staleTime).toBe(60_000);
  });

  it("stays disabled without a session, so an anonymous mount fetches nothing", () => {
    session.userId = null;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useLiveTradesByPrinting(), { wrapper: wrap(client) });

    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.isPending).toBe(true);
    expect(
      client.getQueryCache().find({ queryKey: ["trades", "", "live-by-printing"] }),
    ).toBeDefined();
  });
});

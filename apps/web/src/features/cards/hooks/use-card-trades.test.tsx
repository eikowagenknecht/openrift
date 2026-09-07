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
      // oxlint-disable-next-line react/function-component-definition -- mocked server-fn handler, not a component
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
  await import("@/features/groups/hooks/use-card-trades");

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

describe("useAcceptTrade forwards the giver's copy choice to the server untouched", () => {
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

// refetchInterval is per-observer; this hook mounts once per visible card,
// so a poll interval here arms one timer per card, not one per app.
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

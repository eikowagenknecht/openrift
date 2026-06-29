import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain = {
      handler: () => async () => null,
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

const { useCancelTrade, useSetTradeQuantity } = await import("./use-card-trades");

function wrap(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
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

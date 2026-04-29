import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain = {
      handler: () => async () => null,
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

vi.mock("@/lib/server-fns/fetch-api", () => ({
  fetchApi: vi.fn(),
  fetchApiJson: vi.fn(),
}));

vi.mock("@/lib/server-fns/middleware", () => ({
  withCookies: () => {},
}));

vi.mock("@tanstack/react-pacer", () => ({
  useBatcher: () => ({ addItem: vi.fn() }),
}));

const { useAddCopies, useBatchedAddCopies, useDisposeCopies, useMoveCopies } =
  await import("./use-copies");

function wrap(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

// Regression: useAddCopies (and friends) are wired into useQuickAddActions,
// which renders on the public /cards page. Before this fix the mutation
// hooks called useRequiredUserId() at hook-init time, so an unauthenticated
// visitor browsing /cards would crash the route with "useRequiredUserId()
// called without an authenticated session". The hooks must tolerate a null
// session at mount; the mutation body itself is the right place to guard.
describe("copies mutation hooks tolerate an unauthenticated session at mount", () => {
  it("useAddCopies does not throw when no session is cached", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    expect(() => renderHook(() => useAddCopies(), { wrapper: wrap(client) })).not.toThrow();
  });

  it("useMoveCopies does not throw when no session is cached", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    expect(() => renderHook(() => useMoveCopies(), { wrapper: wrap(client) })).not.toThrow();
  });

  it("useDisposeCopies does not throw when no session is cached", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    expect(() => renderHook(() => useDisposeCopies(), { wrapper: wrap(client) })).not.toThrow();
  });

  it("useBatchedAddCopies does not throw when no session is cached", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    expect(() => renderHook(() => useBatchedAddCopies(), { wrapper: wrap(client) })).not.toThrow();
  });
});

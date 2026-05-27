import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

// The mutations operate on the TanStack DB copies collection for optimistic
// writes. Returning null skips those writes; the API fetch and the
// post-success query invalidation still run, which is what these tests
// care about.
vi.mock("@/lib/copies-collection", () => ({
  useCopiesCollection: () => null,
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

// Regression: adding a card refreshes copyCount instantly via the live
// copies collection, but totalValueCents / unpricedCopyCount are computed
// server-side and only refresh when the collections list is refetched.
// Before this fix the mutation didn't invalidate the collections query, so
// the header's value stayed stale until the user pressed F5.
describe("copy mutations refresh derived collection totals", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn(async () =>
      Response.json([{ id: "real-1", printingId: "p1", collectionId: "c1" }], { status: 200 }),
    ) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function seedSession(client: QueryClient, userId: string) {
    client.setQueryData(["session"], {
      session: { id: "s", userId, expiresAt: "", token: "" },
      user: {
        id: userId,
        name: "Test",
        email: "test@example.test",
        emailVerified: true,
        createdAt: "",
        updatedAt: "",
      },
    });
  }

  it("useAddCopies invalidates the collections query so header totals refresh", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    seedSession(client, "user-1");
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useAddCopies(), { wrapper: wrap(client) });
    await result.current.mutateAsync({
      copies: [{ printingId: "p1", collectionId: "c1" }],
    });

    await waitFor(() => {
      const calls = invalidateSpy.mock.calls.map(([arg]) => arg?.queryKey);
      expect(calls).toContainEqual(["collections", "user-1"]);
    });
  });
});

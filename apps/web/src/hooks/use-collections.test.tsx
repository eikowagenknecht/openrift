import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Server fns are module-level; route every mocked handler to one spy so tests
// can script the API response of whichever fn a hook invokes.
const { serverFnImpl, copiesCollectionHolder } = vi.hoisted(() => ({
  serverFnImpl: vi.fn((_opts?: unknown): Promise<unknown> => Promise.resolve(null)),
  copiesCollectionHolder: { current: null as unknown },
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain = {
      handler: () => (opts?: unknown) => serverFnImpl(opts),
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

vi.mock("@/lib/copies-collection", () => ({
  useCopiesCollection: () => copiesCollectionHolder.current,
}));

const { useClearCollection } = await import("./use-collections");

function wrap(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

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

describe("useClearCollection", () => {
  beforeEach(() => {
    serverFnImpl.mockReset();
    serverFnImpl.mockResolvedValue({ removedCount: 0, keptCopyIds: [] });
    copiesCollectionHolder.current = null;
  });

  it("mirrors the server clear in the synced store, keeping pinned copies", async () => {
    serverFnImpl.mockResolvedValue({ removedCount: 1, keptCopyIds: ["copy-kept"] });
    const writeDelete = vi.fn();
    copiesCollectionHolder.current = {
      toArray: [
        { id: "copy-1", collectionId: "inbox-1" },
        { id: "copy-kept", collectionId: "inbox-1" },
        { id: "copy-other", collectionId: "col-2" },
      ],
      utils: { writeDelete },
    };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    seedSession(client, "user-1");

    const { result } = renderHook(() => useClearCollection(), { wrapper: wrap(client) });
    const res = await result.current.mutateAsync("inbox-1");

    expect(res).toEqual({ id: "inbox-1", removedCount: 1, keptCopyIds: ["copy-kept"] });
    // Only the cleared inbox copy is dropped — the kept (trade/loan-pinned)
    // copy and copies from other collections stay in the synced store.
    await waitFor(() => {
      expect(writeDelete).toHaveBeenCalledWith(["copy-1"]);
    });
  });

  it("skips the store write when the collection had nothing to remove", async () => {
    const writeDelete = vi.fn();
    copiesCollectionHolder.current = {
      toArray: [{ id: "copy-other", collectionId: "col-2" }],
      utils: { writeDelete },
    };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    seedSession(client, "user-1");

    const { result } = renderHook(() => useClearCollection(), { wrapper: wrap(client) });
    await result.current.mutateAsync("inbox-1");

    expect(writeDelete).not.toHaveBeenCalled();
  });

  it("invalidates the collections and copies queries", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    seedSession(client, "user-1");
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useClearCollection(), { wrapper: wrap(client) });
    await result.current.mutateAsync("inbox-1");

    await waitFor(() => {
      const calls = invalidateSpy.mock.calls.map(([arg]) => arg?.queryKey);
      expect(calls).toContainEqual(["collections", "user-1"]);
      expect(calls).toContainEqual(["copies", "user-1"]);
    });
  });
});

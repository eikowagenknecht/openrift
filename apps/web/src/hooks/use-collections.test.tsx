import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createQueryClient } from "@/lib/query-client";
import type { CollectionsResponse } from "@/lib/server-fns/api-types";
import { PERSISTENT_ERROR_TOAST } from "@/lib/toast";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

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

const { useClearCollection, useReorderCollections, useSetCollectionSidebarHidden } =
  await import("./use-collections");

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

function collection(id: string, sortOrder: number): CollectionsResponse["items"][number] {
  return {
    id,
    name: id,
    description: null,
    availableForDeckbuilding: true,
    sidebarHidden: false,
    isInbox: false,
    sortOrder,
    isPublic: false,
    shareToken: null,
    copyCount: 0,
    totalValueCents: null,
    unpricedCopyCount: null,
    createdAt: "2026-05-17T00:00:00Z",
    updatedAt: "2026-05-17T00:00:00Z",
    groupId: null,
    groupSlug: null,
    groupName: null,
    viewerCanAdmin: true,
  };
}

// Declaring onError for the rollback REPLACES the QueryClient's default
// mutation onError (react-query merges mutation options shallowly), so the
// hook has to report the failure itself — otherwise the sidebar order snaps
// back with nothing saying the reorder was rejected.
describe("useReorderCollections", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    serverFnImpl.mockReset();
    vi.mocked(toast.error).mockClear();
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("restores the previous order and toasts when the reorder fails", async () => {
    serverFnImpl.mockRejectedValue(new Error("Service unavailable"));
    // The app's real client, so the test proves the toast survives the default
    // handler being replaced rather than testing a bare QueryClient.
    const client = createQueryClient();
    seedSession(client, "user-1");
    const items = [collection("col-1", 0), collection("col-2", 1)];
    client.setQueryData(["collections", "user-1"], { items });

    const { result } = renderHook(() => useReorderCollections(), { wrapper: wrap(client) });
    await result.current.mutateAsync({ orderedIds: ["col-2", "col-1"] }).catch(() => {});

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(client.getQueryData(["collections", "user-1"])).toEqual({ items });
    expect(toast.error).toHaveBeenCalledWith(expect.any(String), PERSISTENT_ERROR_TOAST);
  });
});

describe("useSetCollectionSidebarHidden", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    serverFnImpl.mockReset();
    vi.mocked(toast.error).mockClear();
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("hides the row in the cache as soon as the menu item is picked", async () => {
    serverFnImpl.mockResolvedValue(null);
    const client = createQueryClient();
    seedSession(client, "user-1");
    client.setQueryData(["collections", "user-1"], {
      items: [collection("col-1", 0), collection("col-2", 1)],
    });

    const { result } = renderHook(() => useSetCollectionSidebarHidden(), { wrapper: wrap(client) });
    await result.current.mutateAsync({ id: "col-1", hidden: true });

    const cached = client.getQueryData(["collections", "user-1"]) as CollectionsResponse;
    expect(cached.items.map((col) => col.sidebarHidden)).toEqual([true, false]);
  });

  // Same replaced-default-onError reasoning as useReorderCollections above.
  it("restores the previous visibility and toasts when the update fails", async () => {
    serverFnImpl.mockRejectedValue(new Error("Service unavailable"));
    const client = createQueryClient();
    seedSession(client, "user-1");
    const items = [collection("col-1", 0), collection("col-2", 1)];
    client.setQueryData(["collections", "user-1"], { items });

    const { result } = renderHook(() => useSetCollectionSidebarHidden(), { wrapper: wrap(client) });
    await result.current.mutateAsync({ id: "col-1", hidden: true }).catch(() => {});

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(client.getQueryData(["collections", "user-1"])).toEqual({ items });
    expect(toast.error).toHaveBeenCalledWith(expect.any(String), PERSISTENT_ERROR_TOAST);
  });
});

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

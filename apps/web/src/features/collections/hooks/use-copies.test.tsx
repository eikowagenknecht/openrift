import type { CopyResponse } from "@openrift/shared/types/api/collection";
import { queryCollectionOptions } from "@tanstack/query-db-collection";
import { createCollection } from "@tanstack/react-db";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { collectionsKeys } from "@/features/collections/lib/collections-query-keys";
import { stubCopy } from "@/test/factories";

const { copiesCollectionHolder } = vi.hoisted(() => ({
  copiesCollectionHolder: { current: null as unknown },
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain = {
      // oxlint-disable-next-line react/function-component-definition -- mocked server-fn handler, not a component
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

vi.mock("@/features/collections/lib/copies-collection", () => ({
  useCopiesCollection: () => copiesCollectionHolder.current,
}));

const { useAddCopies, useBatchedAddCopies, useDisposeCopies, useMoveCopies, useUpdateCopies } =
  await import("./use-copies");

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

function seedCollections(
  client: QueryClient,
  userId: string,
  collections: { id: string; groupId: string | null }[],
) {
  client.setQueryData(collectionsKeys.all(userId), {
    items: collections.map(({ id, groupId }) => ({
      id,
      groupId,
      name: id,
      description: null,
      availableForDeckbuilding: true,
      sidebarHidden: false,
      isInbox: false,
      sortOrder: 0,
      isPublic: false,
      shareToken: null,
      copyCount: 0,
      totalValueCents: null,
      unpricedCopyCount: null,
      createdAt: "",
      updatedAt: "",
      groupSlug: groupId === null ? null : "group",
      groupName: groupId === null ? null : "Group",
      viewerCanAdmin: true,
      homeDecks: [],
    })),
  });
}

let realCollectionCounter = 0;

// createTransaction is real (not mocked) here, so collection.update/.delete
// need a genuine collection to register mutations onto; a stub object can't.
async function makeRealCopiesCollection(queryClient: QueryClient, items: CopyResponse[]) {
  realCollectionCounter++;
  const collection = createCollection(
    queryCollectionOptions<CopyResponse>({
      id: `test-copies-${realCollectionCounter}`,
      queryClient,
      queryKey: ["test-copies", realCollectionCounter],
      queryFn: async () => items,
      getKey: (copy) => copy.id,
    }),
  );
  await collection.preload();
  return collection;
}

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

  it("useUpdateCopies does not throw when no session is cached", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    expect(() => renderHook(() => useUpdateCopies(), { wrapper: wrap(client) })).not.toThrow();
  });
});

describe("copy mutations refresh derived collection totals", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn(async () =>
      Response.json(
        {
          items: [
            {
              id: "real-1",
              printingId: "p1",
              collectionId: "c1",
              groupId: null,
              condition: null,
              grader: null,
              grade: null,
              notesPublic: null,
              notesPrivate: null,
              isAltered: false,
              links: [],
            },
          ],
        },
        { status: 201 },
      ),
    ) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

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

  it("useAddCopies unwraps the { items } envelope and resolves with the created rows", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    seedSession(client, "user-1");

    const { result } = renderHook(() => useAddCopies(), { wrapper: wrap(client) });
    const added = await result.current.mutateAsync({
      copies: [{ printingId: "p1", collectionId: "c1" }],
    });

    expect(added).toEqual([
      {
        id: "real-1",
        printingId: "p1",
        collectionId: "c1",
        groupId: null,
        condition: null,
        grader: null,
        grade: null,
        notesPublic: null,
        notesPrivate: null,
        isAltered: false,
        links: [],
      },
    ]);
  });
});

describe("adding copies with client-minted ids", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    copiesCollectionHolder.current = null;
  });

  it("sends the id so a replayed add cannot create a second row", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    seedSession(client, "user-1");

    let sentBody: unknown;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      sentBody = await (input as Request).clone().json();
      return Response.json(
        { items: [stubCopy({ id: "given-1", printingId: "p1", collectionId: "c1" })] },
        { status: 201 },
      );
    }) as typeof fetch;

    const { result } = renderHook(() => useAddCopies(), { wrapper: wrap(client) });
    await result.current.mutateAsync({
      copies: [{ id: "given-1", printingId: "p1", collectionId: "c1" }],
      clientIds: ["given-1"],
    });

    expect(sentBody).toEqual({
      copies: [{ id: "given-1", printingId: "p1", collectionId: "c1" }],
    });
  });

  it("removes the optimistic row and refetches copies when the add fails, since a lost response may still have created it", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    seedSession(client, "user-1");
    const collection = await makeRealCopiesCollection(client, [stubCopy({ id: "given-1" })]);
    copiesCollectionHolder.current = collection;
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    globalThis.fetch = vi.fn(async () =>
      Response.json({ message: "boom" }, { status: 500 }),
    ) as typeof fetch;

    const { result } = renderHook(() => useAddCopies(), { wrapper: wrap(client) });

    await expect(
      result.current.mutateAsync({
        copies: [{ id: "given-1", printingId: "p1", collectionId: "c1" }],
        clientIds: ["given-1"],
      }),
    ).rejects.toThrow();

    expect(collection.toArray.map((copy) => copy.id)).toEqual([]);
    expect(invalidateSpy.mock.calls.map(([arg]) => arg)).toContainEqual({
      queryKey: ["copies", "user-1"],
    });
  });
});

describe("batch mutations reject when every selected id is still an optimistic temp id", () => {
  afterEach(() => {
    copiesCollectionHolder.current = null;
  });

  it("useDisposeCopies rejects with a clear message instead of silently succeeding", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    seedSession(client, "user-1");
    copiesCollectionHolder.current = {};

    const { result } = renderHook(() => useDisposeCopies(), { wrapper: wrap(client) });

    await expect(result.current.mutateAsync({ copyIds: ["temp-a", "temp-b"] })).rejects.toThrow(
      /still being added/iu,
    );
  });

  it("useMoveCopies rejects with a clear message instead of silently succeeding", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    seedSession(client, "user-1");
    copiesCollectionHolder.current = {};

    const { result } = renderHook(() => useMoveCopies(), { wrapper: wrap(client) });

    await expect(
      result.current.mutateAsync({ copyIds: ["temp-a"], toCollectionId: "col-2" }),
    ).rejects.toThrow(/still being added/iu);
  });

  it("useUpdateCopies rejects with a clear message instead of silently succeeding", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    seedSession(client, "user-1");
    copiesCollectionHolder.current = {};

    const { result } = renderHook(() => useUpdateCopies(), { wrapper: wrap(client) });

    await expect(
      result.current.mutateAsync({ copyIds: ["temp-a"], patch: { condition: "mint" } }),
    ).rejects.toThrow(/still being added/iu);
  });
});

describe("batch mutations with a mix of real and temp ids process only the real ids", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    copiesCollectionHolder.current = null;
  });

  it("useDisposeCopies only sends the real id to the API", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    seedSession(client, "user-1");
    copiesCollectionHolder.current = await makeRealCopiesCollection(client, [
      stubCopy({ id: "real-1" }),
    ]);

    let sentBody: unknown;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      sentBody = await (input as Request).clone().json();
      return new Response(null, { status: 204 });
    }) as typeof fetch;

    const { result } = renderHook(() => useDisposeCopies(), { wrapper: wrap(client) });
    await result.current.mutateAsync({ copyIds: ["temp-x", "real-1"] });

    expect(sentBody).toEqual({ copyIds: ["real-1"] });
  });

  it("useMoveCopies only sends the real id to the API", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    seedSession(client, "user-1");
    copiesCollectionHolder.current = await makeRealCopiesCollection(client, [
      stubCopy({ id: "real-1", collectionId: "source" }),
    ]);

    let sentBody: unknown;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      sentBody = await (input as Request).clone().json();
      return new Response(null, { status: 204 });
    }) as typeof fetch;

    const { result } = renderHook(() => useMoveCopies(), { wrapper: wrap(client) });
    await result.current.mutateAsync({ copyIds: ["temp-x", "real-1"], toCollectionId: "dest" });

    expect(sentBody).toEqual({ copyIds: ["real-1"], toCollectionId: "dest" });
  });
});

describe("moving copies carries the destination collection's group id", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 204 })) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    copiesCollectionHolder.current = null;
  });

  it("clears groupId when taking a copy from a group box into a personal collection", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    seedSession(client, "user-1");
    seedCollections(client, "user-1", [
      { id: "box", groupId: "group-1" },
      { id: "inbox", groupId: null },
    ]);
    const collection = await makeRealCopiesCollection(client, [
      stubCopy({ id: "real-1", collectionId: "box", groupId: "group-1" }),
    ]);
    copiesCollectionHolder.current = collection;

    const { result } = renderHook(() => useMoveCopies(), { wrapper: wrap(client) });
    await result.current.mutateAsync({ copyIds: ["real-1"], toCollectionId: "inbox" });

    const moved = collection.toArray.find((copy) => copy.id === "real-1");
    expect(moved?.collectionId).toBe("inbox");
    expect(moved?.groupId).toBeNull();
  });

  it("sets groupId when contributing a personal copy to a group collection", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    seedSession(client, "user-1");
    seedCollections(client, "user-1", [
      { id: "inbox", groupId: null },
      { id: "box", groupId: "group-1" },
    ]);
    const collection = await makeRealCopiesCollection(client, [
      stubCopy({ id: "real-1", collectionId: "inbox", groupId: null }),
    ]);
    copiesCollectionHolder.current = collection;

    const { result } = renderHook(() => useMoveCopies(), { wrapper: wrap(client) });
    await result.current.mutateAsync({ copyIds: ["real-1"], toCollectionId: "box" });

    const moved = collection.toArray.find((copy) => copy.id === "real-1");
    expect(moved?.collectionId).toBe("box");
    expect(moved?.groupId).toBe("group-1");
  });
});

describe("chunked batch mutations confirm each chunk as it succeeds", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    copiesCollectionHolder.current = null;
  });

  it("useMoveCopies keeps chunk 1 applied when chunk 2 fails, and the error propagates", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    seedSession(client, "user-1");

    const ids = Array.from({ length: 700 }, (_, i) => `real-${i}`);
    const collection = await makeRealCopiesCollection(
      client,
      ids.map((id) => stubCopy({ id, collectionId: "source" })),
    );
    copiesCollectionHolder.current = collection;

    let callCount = 0;
    globalThis.fetch = vi.fn(async () => {
      callCount++;
      if (callCount === 2) {
        return Response.json({ message: "boom" }, { status: 500 });
      }
      return new Response(null, { status: 204 });
    }) as typeof fetch;

    const { result } = renderHook(() => useMoveCopies(), { wrapper: wrap(client) });

    await expect(
      result.current.mutateAsync({ copyIds: ids, toCollectionId: "dest" }),
    ).rejects.toThrow();

    expect(callCount).toBe(2);
    const byId = new Map(collection.toArray.map((copy) => [copy.id, copy]));
    expect(byId.get("real-0")?.collectionId).toBe("dest");
    expect(byId.get("real-499")?.collectionId).toBe("dest");
    expect(byId.get("real-699")?.collectionId).toBe("source");
  });

  it("useDisposeCopies keeps chunk 1's deletions applied when chunk 2 fails, and the error propagates", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    seedSession(client, "user-1");

    const ids = Array.from({ length: 700 }, (_, i) => `real-${i}`);
    const collection = await makeRealCopiesCollection(
      client,
      ids.map((id) => stubCopy({ id })),
    );
    copiesCollectionHolder.current = collection;

    let callCount = 0;
    globalThis.fetch = vi.fn(async () => {
      callCount++;
      if (callCount === 2) {
        return Response.json({ message: "boom" }, { status: 500 });
      }
      return new Response(null, { status: 204 });
    }) as typeof fetch;

    const { result } = renderHook(() => useDisposeCopies(), { wrapper: wrap(client) });

    await expect(result.current.mutateAsync({ copyIds: ids })).rejects.toThrow();

    expect(callCount).toBe(2);
    const remainingIds = new Set(collection.toArray.map((copy) => copy.id));
    expect(remainingIds.has("real-0")).toBe(false);
    expect(remainingIds.has("real-499")).toBe(false);
    expect(remainingIds.has("real-699")).toBe(true);
  });
});

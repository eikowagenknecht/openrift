import type { CopyResponse } from "@openrift/shared";
import { queryCollectionOptions } from "@tanstack/query-db-collection";
import { createCollection } from "@tanstack/react-db";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { stubCopy } from "@/test/factories";

// Mutable holder so individual tests can swap in a real TanStack DB collection
// (see makeRealCopiesCollection below) while the default stays null, matching
// the previous static mock for every test that doesn't opt in.
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

// The mutations operate on the TanStack DB copies collection for optimistic
// writes. Returning null (the default) skips those writes; the API fetch and
// the post-success query invalidation still run, which is what most of these
// tests care about. Tests that need to observe collection.update/.delete
// (the temp-id filter and the chunked-batch rollback) set
// copiesCollectionHolder.current to a real collection instead.
vi.mock("@/lib/copies-collection", () => ({
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

let realCollectionCounter = 0;

// A genuine TanStack DB collection (not a stub) backed by an in-memory query
// fn, mirroring apps/web/src/lib/copies-collection.ts closely enough for
// collection.update / collection.delete / utils.writeUpdate / utils.writeDelete
// to behave exactly as they do in production. Needed because createTransaction
// is real (not mocked) in this file: collection.update/.delete register
// mutations onto the active transaction, which a plain stub object can't do.
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

  it("useUpdateCopies does not throw when no session is cached", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    expect(() => renderHook(() => useUpdateCopies(), { wrapper: wrap(client) })).not.toThrow();
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
    // POST /copies returns the { items } envelope (CopyAddResponse) with a 201,
    // not a bare array — the mock must mirror the real contract so a future
    // envelope drift is caught here instead of crashing in production.
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

  // Regression: POST /copies returns the { items } envelope, not a bare array.
  // addCopiesApi must unwrap it before the mutation maps over the rows. Before
  // the fix it cast the body straight to AddCopyResult[] and ran .map() on the
  // { items } object, throwing a TypeError that rolled back the optimistic add
  // even though the server had created the copy. The old mock returned a bare
  // array, which hid the drift once the API moved to { items }.
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

// Regression: filtering out optimistic temp ids (rows still in flight from
// useBatchedAddCopies) could leave `realCopyIds` empty, but the mutation
// still resolved successfully — the caller's onSuccess fired, a success
// toast showed, and the selection cleared, even though nothing was actually
// moved/disposed/updated. Rejecting instead routes through the caller's
// onError path (error toast, selection kept).
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

// Regression: a selection mixing real ids with in-flight temp ids must still
// process the real ids (only an all-temp selection is rejected). Reading the
// request body sent to the API pins that the temp id never reaches it.
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

// Regression: the chunked API loop confirmed all chunks' optimistic writes
// together only after every chunk's API call had succeeded, inside one
// createTransaction mutationFn. A later chunk's failure rejected the whole
// mutationFn, which rolled back ALL optimistic writes — including chunks the
// server had already committed — leaving the UI stale until reload. Each
// chunk must now be confirmed (utils.writeUpdate/writeDelete) as soon as its
// own API call succeeds, so only the not-yet-committed remainder rolls back.
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

    // Two chunks of 500 (BATCH_SIZE) → the second (200-id) chunk is what fails.
    expect(callCount).toBe(2);
    const byId = new Map(collection.toArray.map((copy) => [copy.id, copy]));
    // Chunk 1 (ids 0-499) already got its API confirmation before chunk 2
    // failed, so it stays applied instead of being discarded by the rollback.
    expect(byId.get("real-0")?.collectionId).toBe("dest");
    expect(byId.get("real-499")?.collectionId).toBe("dest");
    // Chunk 2 (ids 500-699) never got a confirmation, so its optimistic write
    // rolls back to the pre-mutation state.
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
    // Chunk 1 was already confirmed deleted before chunk 2 failed.
    expect(remainingIds.has("real-0")).toBe(false);
    expect(remainingIds.has("real-499")).toBe(false);
    // Chunk 2 never got a confirmation, so its optimistic delete rolls back.
    expect(remainingIds.has("real-699")).toBe(true);
  });
});

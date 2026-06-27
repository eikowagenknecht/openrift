import {
  createCollection,
  createTransaction,
  localOnlyCollectionOptions,
} from "@tanstack/react-db";
import type { Transaction } from "@tanstack/react-db";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

import type { CollectionShapeRow } from "@/lib/collections-offline";
import { queryKeys } from "@/lib/query-keys";

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

const USER_ID = "user-a";

vi.mock("@/lib/auth-session", () => ({
  useRequiredUserId: () => USER_ID,
}));

// The hooks read the synced collections, the copies view, and the writer from
// this module; tests swap in fakes per-case.
const collectionMocks: {
  copiesView: unknown;
  syncedCollections: unknown;
  writer: unknown;
} = {
  copiesView: null,
  syncedCollections: null,
  writer: null,
};
vi.mock("@/lib/copies-collection", () => ({
  useCopiesCollection: () => collectionMocks.copiesView,
  useSyncedCollections: () => collectionMocks.syncedCollections,
  useCollectionsWriter: () => collectionMocks.writer,
}));

const {
  useCollections,
  useCreateCollection,
  useDeleteCollection,
  useReorderCollections,
  useUpdateCollection,
} = await import("./use-collections");

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

function wrap(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <Suspense fallback={null}>{children}</Suspense>
      </QueryClientProvider>
    );
  };
}

// Fake offline executor mirroring the package's plain-Transaction fallback —
// the exact surface createOfflineTx relies on. Records the metadata each
// transaction was opened with, so tests can assert what rides to the outbox.
type FakeMutationFn = Mock<
  (params: { transaction: Transaction<CollectionShapeRow> }) => Promise<void>
>;

function createFakeExecutor(mutationFn: FakeMutationFn, online = true) {
  const openedMetadata: (Record<string, unknown> | undefined)[] = [];
  return {
    openedMetadata,
    isOnline: () => online,
    createOfflineTransaction: ({
      mutationFnName,
      metadata,
    }: {
      mutationFnName: string;
      metadata?: Record<string, unknown>;
    }) => {
      openedMetadata.push(metadata);
      let inner: Transaction<CollectionShapeRow> | null = null;
      return {
        mutate: (callback: () => void) => {
          inner ??= createTransaction<CollectionShapeRow>({
            autoCommit: false,
            metadata: { ...metadata, mutationFnName },
            mutationFn: async ({ transaction }) => {
              await mutationFn({ transaction });
            },
          });
          inner.mutate(callback);
          return inner;
        },
        commit: () => {
          if (!inner) {
            throw new Error("No mutations to commit");
          }
          return inner.commit();
        },
      };
    },
  };
}

function createShapeCollection() {
  return createCollection(
    localOnlyCollectionOptions<CollectionShapeRow>({
      id: `test-collections-shape-${crypto.randomUUID()}`,
      getKey: (row) => row.id,
    }),
  );
}

function makeWriter(options?: { online?: boolean; mutationFn?: FakeMutationFn }) {
  const mutationFn: FakeMutationFn = options?.mutationFn ?? vi.fn(async () => undefined);
  const collection = createShapeCollection();
  const executor = createFakeExecutor(mutationFn, options?.online ?? true);
  return { collection, executor, mutationFn };
}

function makeRow(id: string, overrides: Partial<CollectionShapeRow> = {}): CollectionShapeRow {
  return {
    id,
    group_id: null,
    name: `Collection ${id}`,
    description: null,
    is_inbox: false,
    sort_order: 0,
    ...overrides,
  };
}

function serverItem(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: `Server ${id}`,
    description: null,
    availableForDeckbuilding: true,
    isInbox: false,
    sortOrder: 0,
    isPublic: false,
    shareToken: null,
    copyCount: 0,
    totalValueCents: null,
    unpricedCopyCount: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    groupId: null,
    groupSlug: null,
    groupName: null,
    viewerCanAdmin: true,
    ...overrides,
  };
}

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

beforeEach(() => {
  collectionMocks.copiesView = null;
  collectionMocks.syncedCollections = null;
  collectionMocks.writer = null;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("collection mutation hooks tolerate an unauthenticated session at mount", () => {
  it.each([
    ["useCreateCollection", useCreateCollection],
    ["useUpdateCollection", useUpdateCollection],
    ["useDeleteCollection", useDeleteCollection],
    ["useReorderCollections", useReorderCollections],
  ])("%s does not throw when no writer exists", (_name, hook) => {
    const client = makeClient();
    expect(() => renderHook(() => hook(), { wrapper: wrap(client) })).not.toThrow();
  });
});

describe("useCollections", () => {
  it("falls back to the server list while the synced shape is not ready", async () => {
    const client = makeClient();
    client.setQueryData(queryKeys.collections.all(USER_ID), {
      items: [serverItem("col-1", { name: "Main Binder", copyCount: 3 })],
    });

    const { result } = renderHook(() => useCollections(), { wrapper: wrap(client) });

    await waitFor(() => {
      expect(result.current?.data).toHaveLength(1);
    });
    expect(result.current.data[0]).toMatchObject({ name: "Main Binder", copyCount: 3 });
  });

  it("renders from the synced rows (name, order) merged with server-derived fields", async () => {
    const client = makeClient();
    client.setQueryData(queryKeys.collections.all(USER_ID), {
      items: [
        serverItem("inbox", { isInbox: true, copyCount: 2 }),
        serverItem("col-1", {
          name: "Stale Server Name",
          shareToken: "tok-1",
          isPublic: true,
          totalValueCents: 1234,
          sortOrder: 1,
        }),
      ],
    });
    const synced = createShapeCollection();
    synced.insert([
      makeRow("col-1", { name: "Fresh Synced Name", sort_order: 1 }),
      makeRow("inbox", { name: "Inbox", is_inbox: true, sort_order: 0 }),
      // A row the query layer doesn't know yet (optimistic create).
      makeRow("col-new", { name: "Brand New", sort_order: 2 }),
    ]);
    collectionMocks.syncedCollections = synced;

    const { result } = renderHook(() => useCollections(), { wrapper: wrap(client) });

    await waitFor(() => {
      expect(result.current?.data).toHaveLength(3);
    });
    const [first, second, third] = result.current.data;
    // Inbox pinned first, then by sort order.
    expect(first).toMatchObject({ id: "inbox", isInbox: true });
    // Synced shape wins for name; query layer keeps share/value fields.
    expect(second).toMatchObject({
      id: "col-1",
      name: "Fresh Synced Name",
      shareToken: "tok-1",
      isPublic: true,
      totalValueCents: 1234,
    });
    // Optimistic-only row gets safe fallbacks until the list refetches.
    expect(third).toMatchObject({
      id: "col-new",
      name: "Brand New",
      viewerCanAdmin: true,
      availableForDeckbuilding: true,
      copyCount: 0,
    });
  });

  it("derives live copy counts from the synced copies view", async () => {
    const client = makeClient();
    client.setQueryData(queryKeys.collections.all(USER_ID), {
      items: [serverItem("col-1", { copyCount: 99 })],
    });
    const copiesView = createCollection(
      localOnlyCollectionOptions<{ id: string; collectionId: string }>({
        id: `test-copies-view-${crypto.randomUUID()}`,
        getKey: (row) => row.id,
      }),
    );
    copiesView.insert([
      { id: "c1", collectionId: "col-1" },
      { id: "c2", collectionId: "col-1" },
    ]);
    collectionMocks.copiesView = copiesView;

    const { result } = renderHook(() => useCollections(), { wrapper: wrap(client) });

    await waitFor(() => {
      expect(result.current?.data?.[0]?.copyCount).toBe(2);
    });
  });
});

describe("useCreateCollection", () => {
  it("inserts an optimistic row with a client-generated uuidv7 id and resolves with it", async () => {
    const client = makeClient();
    const writer = makeWriter();
    collectionMocks.writer = writer;

    const { result } = renderHook(() => useCreateCollection(), { wrapper: wrap(client) });
    const created = await result.current.mutateAsync({ name: "New Binder" });

    expect(created.id).toMatch(UUID_PATTERN);
    expect(created.name).toBe("New Binder");
    expect(writer.mutationFn).toHaveBeenCalledTimes(1);
    const tx = writer.mutationFn.mock.calls[0][0].transaction;
    expect(tx.mutations.map((mutation) => mutation.modified)).toEqual([
      {
        id: created.id,
        group_id: null,
        name: "New Binder",
        description: null,
        is_inbox: false,
        sort_order: 0,
      },
    ]);
  });

  it("appends personal collections after the current max sort_order", async () => {
    const client = makeClient();
    const writer = makeWriter();
    writer.collection.insert([
      makeRow("a", { sort_order: 4 }),
      makeRow("g", { group_id: "grp-1", sort_order: 9 }),
    ]);
    collectionMocks.writer = writer;

    const { result } = renderHook(() => useCreateCollection(), { wrapper: wrap(client) });
    const created = await result.current.mutateAsync({ name: "Appended" });

    const tx = writer.mutationFn.mock.calls[0][0].transaction;
    const inserted = tx.mutations.find((mutation) => mutation.key === created.id);
    // Group rows are excluded from the personal max.
    expect(inserted?.modified.sort_order).toBe(5);
  });

  it("creates a group collection with group_id on the row and groupSlug in the tx metadata", async () => {
    const client = makeClient();
    const writer = makeWriter();
    collectionMocks.writer = writer;

    const { result } = renderHook(() => useCreateCollection(), { wrapper: wrap(client) });
    const created = await result.current.mutateAsync({
      name: "Pool",
      groupSlug: "friday-night",
      groupId: "grp-9",
    });

    const tx = writer.mutationFn.mock.calls[0][0].transaction;
    const inserted = tx.mutations.find((mutation) => mutation.key === created.id);
    expect(inserted?.modified).toMatchObject({ group_id: "grp-9", sort_order: 0 });
    expect(writer.executor.openedMetadata).toEqual([{ groupSlug: "friday-night" }]);
  });

  it("resolves while offline — the outbox owns the write", async () => {
    const client = makeClient();
    const never = Promise.withResolvers<void>().promise;
    const pendingForever: FakeMutationFn = vi.fn(() => never);
    const writer = makeWriter({ online: false, mutationFn: pendingForever });
    collectionMocks.writer = writer;

    const { result } = renderHook(() => useCreateCollection(), { wrapper: wrap(client) });
    const created = await result.current.mutateAsync({ name: "Offline Binder" });

    expect(writer.collection.toArray.map((row) => row.id)).toContain(created.id);
  });

  it("rejects (and rolls back) when the mutation function fails permanently", async () => {
    const client = makeClient();
    const failing: FakeMutationFn = vi.fn(async () => {
      throw new Error("Forbidden");
    });
    const writer = makeWriter({ mutationFn: failing });
    collectionMocks.writer = writer;

    const { result } = renderHook(() => useCreateCollection(), { wrapper: wrap(client) });
    await expect(result.current.mutateAsync({ name: "Nope" })).rejects.toThrow("Forbidden");
    expect(writer.collection.toArray).toHaveLength(0);
  });

  it("rejects when no writer exists (signed out)", async () => {
    const client = makeClient();
    const { result } = renderHook(() => useCreateCollection(), { wrapper: wrap(client) });

    await expect(result.current.mutateAsync({ name: "Nope" })).rejects.toThrow(
      "Cannot create a collection while signed out",
    );
  });
});

describe("useUpdateCollection", () => {
  it("applies the rename optimistically inside one offline tx", async () => {
    const client = makeClient();
    const writer = makeWriter();
    writer.collection.insert([makeRow("col-1", { name: "Old Name" })]);
    collectionMocks.writer = writer;

    const { result } = renderHook(() => useUpdateCollection(), { wrapper: wrap(client) });
    await result.current.mutateAsync({ id: "col-1", name: "New Name" });

    expect(writer.mutationFn).toHaveBeenCalledTimes(1);
    const tx = writer.mutationFn.mock.calls[0][0].transaction;
    expect(tx.mutations).toHaveLength(1);
    expect(tx.mutations[0].changes).toEqual({ name: "New Name" });
    expect(tx.mutations[0].modified).toMatchObject({ id: "col-1", name: "New Name" });
  });
});

describe("useDeleteCollection", () => {
  it("deletes the row optimistically and resolves with the id", async () => {
    const client = makeClient();
    const writer = makeWriter();
    writer.collection.insert([makeRow("col-1")]);
    collectionMocks.writer = writer;

    const { result } = renderHook(() => useDeleteCollection(), { wrapper: wrap(client) });
    const deletedId = await result.current.mutateAsync("col-1");

    expect(deletedId).toBe("col-1");
    expect(writer.mutationFn).toHaveBeenCalledTimes(1);
    const tx = writer.mutationFn.mock.calls[0][0].transaction;
    expect(tx.mutations.map((mutation) => [mutation.type, mutation.key])).toEqual([
      ["delete", "col-1"],
    ]);
  });
});

describe("useReorderCollections", () => {
  it("renumbers sort_order by position and sends the full list as tx metadata", async () => {
    const client = makeClient();
    const writer = makeWriter();
    writer.collection.insert([
      makeRow("a", { sort_order: 0 }),
      makeRow("b", { sort_order: 1 }),
      makeRow("c", { sort_order: 2 }),
    ]);
    collectionMocks.writer = writer;

    const { result } = renderHook(() => useReorderCollections(), { wrapper: wrap(client) });
    await result.current.mutateAsync({ orderedIds: ["c", "a", "b"] });

    const tx = writer.mutationFn.mock.calls[0][0].transaction;
    const orders = new Map(
      tx.mutations.map((mutation) => [mutation.key, mutation.modified.sort_order]),
    );
    expect(orders.get("c")).toBe(0);
    expect(orders.get("a")).toBe(1);
    expect(orders.get("b")).toBe(2);
    expect(writer.executor.openedMetadata).toEqual([{ orderedIds: ["c", "a", "b"] }]);
  });

  it("no-ops on an empty id list", async () => {
    const client = makeClient();
    const writer = makeWriter();
    collectionMocks.writer = writer;

    const { result } = renderHook(() => useReorderCollections(), { wrapper: wrap(client) });
    await result.current.mutateAsync({ orderedIds: [] });

    expect(writer.mutationFn).not.toHaveBeenCalled();
  });
});

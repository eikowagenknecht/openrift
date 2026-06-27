import type { ListDetailResponse, ListResponse } from "@openrift/shared";
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

import type { ListEntryShapeRow, ListShapeRow } from "@/lib/lists-offline";
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

// The hooks read the synced lists/entries shapes and the writer from this
// module; tests swap in fakes per-case.
const collectionMocks: {
  syncedLists: unknown;
  syncedListEntries: unknown;
  writer: unknown;
} = {
  syncedLists: null,
  syncedListEntries: null,
  writer: null,
};
vi.mock("@/lib/copies-collection", () => ({
  useSyncedLists: () => collectionMocks.syncedLists,
  useSyncedListEntries: () => collectionMocks.syncedListEntries,
  useListsWriter: () => collectionMocks.writer,
}));

const {
  useBulkAddListEntries,
  useBulkRemoveListEntries,
  useCreateList,
  useDeleteList,
  useListDetail,
  useLists,
  useRemoveListEntry,
  useReorderLists,
  useUpdateList,
  useUpdateListEntry,
} = await import("./use-lists");

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
// the exact surface createOfflineTx relies on. Records the name and metadata
// each transaction was opened with, so tests can assert what rides to the
// outbox.
type FakeMutationFn = Mock<
  (params: { transaction: Transaction<ListShapeRow | ListEntryShapeRow> }) => Promise<void>
>;

function createFakeExecutor(mutationFn: FakeMutationFn, online = true) {
  const opened: { mutationFnName: string; metadata?: Record<string, unknown> }[] = [];
  return {
    opened,
    isOnline: () => online,
    createOfflineTransaction: ({
      mutationFnName,
      metadata,
    }: {
      mutationFnName: string;
      metadata?: Record<string, unknown>;
    }) => {
      opened.push({ mutationFnName, ...(metadata ? { metadata } : {}) });
      let inner: Transaction<ListShapeRow | ListEntryShapeRow> | null = null;
      return {
        mutate: (callback: () => void) => {
          inner ??= createTransaction<ListShapeRow | ListEntryShapeRow>({
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

function createListsShape() {
  return createCollection(
    localOnlyCollectionOptions<ListShapeRow>({
      id: `test-lists-shape-${crypto.randomUUID()}`,
      getKey: (row) => row.id,
    }),
  );
}

function createEntriesShape() {
  return createCollection(
    localOnlyCollectionOptions<ListEntryShapeRow>({
      id: `test-list-entries-shape-${crypto.randomUUID()}`,
      getKey: (row) => row.id,
    }),
  );
}

function makeWriter(options?: { online?: boolean; mutationFn?: FakeMutationFn }) {
  const mutationFn: FakeMutationFn = options?.mutationFn ?? vi.fn(async () => undefined);
  const lists = createListsShape();
  const listEntries = createEntriesShape();
  const executor = createFakeExecutor(mutationFn, options?.online ?? true);
  return { lists, listEntries, executor, mutationFn };
}

function makeListRow(id: string, overrides: Partial<ListShapeRow> = {}): ListShapeRow {
  return {
    id,
    name: `List ${id}`,
    intent: "wish",
    kind: "card",
    default_price_pref: null,
    default_price_absolute_cents: null,
    default_trade_type: null,
    currency: null,
    sort_order: 0,
    ...overrides,
  };
}

function makeEntryRow(id: string, overrides: Partial<ListEntryShapeRow> = {}): ListEntryShapeRow {
  return {
    id,
    list_id: "lst-1",
    kind: "card",
    card_id: `card-${id}`,
    printing_id: null,
    copy_id: null,
    quantity: 1,
    price_pref: null,
    price_absolute_cents: null,
    trade_type: null,
    ...overrides,
  };
}

function serverList(id: string, overrides: Partial<ListResponse> = {}): ListResponse {
  return {
    id,
    name: `Server ${id}`,
    intent: "wish",
    kind: "card",
    entryCount: 0,
    isPublic: false,
    shareToken: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    tradeDefaults: { pricePref: null, priceAbsoluteCents: null, tradeType: null },
    currency: null,
    ...overrides,
  };
}

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

beforeEach(() => {
  collectionMocks.syncedLists = null;
  collectionMocks.syncedListEntries = null;
  collectionMocks.writer = null;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("list mutation hooks tolerate an unauthenticated session at mount", () => {
  it.each([
    ["useCreateList", useCreateList],
    ["useUpdateList", useUpdateList],
    ["useDeleteList", useDeleteList],
    ["useReorderLists", useReorderLists],
    ["useBulkAddListEntries", useBulkAddListEntries],
    ["useUpdateListEntry", useUpdateListEntry],
    ["useRemoveListEntry", useRemoveListEntry],
    ["useBulkRemoveListEntries", useBulkRemoveListEntries],
  ])("%s does not throw when no writer exists", (_name, hook) => {
    const client = makeClient();
    expect(() => renderHook(() => hook(), { wrapper: wrap(client) })).not.toThrow();
  });
});

describe("useLists", () => {
  it("falls back to the server list while the synced shape is not ready", async () => {
    const client = makeClient();
    client.setQueryData(queryKeys.lists.all(USER_ID), {
      items: [serverList("lst-1", { name: "Wants", entryCount: 3 })],
    });

    const { result } = renderHook(() => useLists(), { wrapper: wrap(client) });

    await waitFor(() => {
      expect(result.current?.data).toHaveLength(1);
    });
    expect(result.current.data[0]).toMatchObject({ name: "Wants", entryCount: 3 });
  });

  it("renders from the synced rows (name, order) merged with server-derived fields", async () => {
    const client = makeClient();
    client.setQueryData(queryKeys.lists.all(USER_ID), {
      items: [
        serverList("lst-1", {
          name: "Stale Server Name",
          shareToken: "tok-1",
          isPublic: true,
        }),
      ],
    });
    const synced = createListsShape();
    synced.insert([
      makeListRow("lst-1", { name: "Fresh Synced Name", sort_order: 1 }),
      // A row the query layer doesn't know yet (optimistic create).
      makeListRow("lst-new", { name: "Brand New", sort_order: 0 }),
    ]);
    collectionMocks.syncedLists = synced;

    const { result } = renderHook(() => useLists(), { wrapper: wrap(client) });

    await waitFor(() => {
      expect(result.current?.data).toHaveLength(2);
    });
    const [first, second] = result.current.data;
    // Ordered by sort_order, not server order.
    expect(first).toMatchObject({ id: "lst-new", name: "Brand New" });
    // Synced shape wins for name; query layer keeps share state.
    expect(second).toMatchObject({
      id: "lst-1",
      name: "Fresh Synced Name",
      shareToken: "tok-1",
      isPublic: true,
    });
  });

  it("filters synced rows by intent and derives live entry counts", async () => {
    const client = makeClient();
    client.setQueryData(queryKeys.lists.all(USER_ID, "wish"), { items: [] });
    const synced = createListsShape();
    synced.insert([
      makeListRow("lst-w", { intent: "wish" }),
      makeListRow("lst-t", { intent: "trade", kind: "copy" }),
    ]);
    const entries = createEntriesShape();
    entries.insert([
      makeEntryRow("e1", { list_id: "lst-w" }),
      makeEntryRow("e2", { list_id: "lst-w" }),
      makeEntryRow("e3", { list_id: "lst-t", kind: "copy", card_id: null, copy_id: "cp-1" }),
    ]);
    collectionMocks.syncedLists = synced;
    collectionMocks.syncedListEntries = entries;

    const { result } = renderHook(() => useLists("wish"), { wrapper: wrap(client) });

    await waitFor(() => {
      expect(result.current?.data).toHaveLength(1);
    });
    expect(result.current.data[0]).toMatchObject({ id: "lst-w", entryCount: 2 });
  });
});

describe("useListDetail", () => {
  const LIST_ID = "lst-1";

  function seedDetail(client: QueryClient) {
    const detail: ListDetailResponse = {
      list: serverList(LIST_ID, { name: "Wants", entryCount: 2 }),
      entries: [
        {
          id: "e1",
          listId: LIST_ID,
          kind: "card",
          cardId: "card-e1",
          quantity: 1,
          tradeOverride: { pricePref: null, priceAbsoluteCents: null, tradeType: null },
          cardName: "Annie",
          cardType: "unit",
        },
        {
          id: "e2",
          listId: LIST_ID,
          kind: "card",
          cardId: "card-e2",
          quantity: 4,
          tradeOverride: { pricePref: null, priceAbsoluteCents: null, tradeType: null },
          cardName: "Braum",
          cardType: "unit",
        },
      ],
    };
    client.setQueryData(queryKeys.lists.detail(USER_ID, LIST_ID), detail);
  }

  it("overrides quantity and trade override from the synced entries", async () => {
    const client = makeClient();
    seedDetail(client);
    const entries = createEntriesShape();
    entries.insert([
      makeEntryRow("e1", { quantity: 7, trade_type: "cards" }),
      makeEntryRow("e2", { quantity: 4 }),
    ]);
    collectionMocks.syncedListEntries = entries;

    const { result } = renderHook(() => useListDetail(LIST_ID), { wrapper: wrap(client) });

    await waitFor(() => {
      expect(result.current?.data.entries).toHaveLength(2);
    });
    expect(result.current.data.entries[0]).toMatchObject({
      id: "e1",
      quantity: 7,
      cardName: "Annie",
      tradeOverride: { pricePref: null, priceAbsoluteCents: null, tradeType: "cards" },
    });
    expect(result.current.data.list.entryCount).toBe(2);
  });

  it("drops entries missing from the synced shape (optimistic delete)", async () => {
    const client = makeClient();
    seedDetail(client);
    const entries = createEntriesShape();
    entries.insert([makeEntryRow("e2")]);
    collectionMocks.syncedListEntries = entries;

    const { result } = renderHook(() => useListDetail(LIST_ID), { wrapper: wrap(client) });

    await waitFor(() => {
      expect(result.current?.data.entries).toHaveLength(1);
    });
    expect(result.current.data.entries[0].id).toBe("e2");
    expect(result.current.data.list.entryCount).toBe(1);
  });

  it("counts fresh optimistic entries the query layer can't enrich yet", async () => {
    const client = makeClient();
    seedDetail(client);
    const entries = createEntriesShape();
    entries.insert([makeEntryRow("e1"), makeEntryRow("e2"), makeEntryRow("e-fresh")]);
    collectionMocks.syncedListEntries = entries;

    const { result } = renderHook(() => useListDetail(LIST_ID), { wrapper: wrap(client) });

    await waitFor(() => {
      expect(result.current?.data.list.entryCount).toBe(3);
    });
    // The fresh row stays hidden until the invalidation refetch delivers its
    // enrichment, matching the old optimistic behavior.
    expect(result.current.data.entries.map((entry) => entry.id)).toEqual(["e1", "e2"]);
  });

  it("takes name and trade defaults from the synced list row", async () => {
    const client = makeClient();
    seedDetail(client);
    const synced = createListsShape();
    synced.insert([makeListRow(LIST_ID, { name: "Renamed Offline", currency: "EUR" })]);
    collectionMocks.syncedLists = synced;

    const { result } = renderHook(() => useListDetail(LIST_ID), { wrapper: wrap(client) });

    await waitFor(() => {
      expect(result.current?.data.list.name).toBe("Renamed Offline");
    });
    expect(result.current.data.list.currency).toBe("EUR");
    // Share state stays query-layer.
    expect(result.current.data.list.isPublic).toBe(false);
  });
});

describe("useCreateList", () => {
  it("inserts an optimistic row with a client-generated uuidv7 id and resolves with it", async () => {
    const client = makeClient();
    const writer = makeWriter();
    collectionMocks.writer = writer;

    const { result } = renderHook(() => useCreateList(), { wrapper: wrap(client) });
    const created = await result.current.mutateAsync({
      name: "Wants",
      intent: "wish",
      kind: "card",
    });

    expect(created.id).toMatch(UUID_PATTERN);
    expect(created.name).toBe("Wants");
    expect(writer.mutationFn).toHaveBeenCalledTimes(1);
    const tx = writer.mutationFn.mock.calls[0][0].transaction;
    expect(tx.mutations.map((mutation) => mutation.modified)).toEqual([
      {
        id: created.id,
        name: "Wants",
        intent: "wish",
        kind: "card",
        default_price_pref: null,
        default_price_absolute_cents: null,
        default_trade_type: null,
        currency: null,
        sort_order: 0,
      },
    ]);
    expect(writer.executor.opened).toEqual([{ mutationFnName: "createLists" }]);
  });

  it("appends to the current max sort_order within the same intent bucket", async () => {
    const client = makeClient();
    const writer = makeWriter();
    writer.lists.insert([
      makeListRow("a", { intent: "wish", sort_order: 4 }),
      makeListRow("t", { intent: "trade", kind: "copy", sort_order: 9 }),
    ]);
    collectionMocks.writer = writer;

    const { result } = renderHook(() => useCreateList(), { wrapper: wrap(client) });
    const created = await result.current.mutateAsync({
      name: "Appended",
      intent: "wish",
      kind: "card",
    });

    const tx = writer.mutationFn.mock.calls[0][0].transaction;
    const inserted = tx.mutations.find((mutation) => mutation.key === created.id);
    const insertedRow = inserted?.modified as ListShapeRow | undefined;
    // Other intents are excluded from the bucket max.
    expect(insertedRow?.sort_order).toBe(5);
  });

  it("strips trade defaults and currency on organize lists (mirrors the server)", async () => {
    const client = makeClient();
    const writer = makeWriter();
    collectionMocks.writer = writer;

    const { result } = renderHook(() => useCreateList(), { wrapper: wrap(client) });
    await result.current.mutateAsync({
      name: "Binder",
      intent: "organize",
      kind: "card",
      tradeDefaults: { pricePref: "cm_lowest", priceAbsoluteCents: null, tradeType: "cards" },
      currency: "EUR",
    });

    const tx = writer.mutationFn.mock.calls[0][0].transaction;
    expect(tx.mutations[0].modified).toMatchObject({
      default_price_pref: null,
      default_trade_type: null,
      currency: null,
    });
  });

  it("resolves while offline — the outbox owns the write", async () => {
    const client = makeClient();
    const never = Promise.withResolvers<void>().promise;
    const pendingForever: FakeMutationFn = vi.fn(() => never);
    const writer = makeWriter({ online: false, mutationFn: pendingForever });
    collectionMocks.writer = writer;

    const { result } = renderHook(() => useCreateList(), { wrapper: wrap(client) });
    const created = await result.current.mutateAsync({
      name: "Offline List",
      intent: "wish",
      kind: "card",
    });

    expect(writer.lists.toArray.map((row) => row.id)).toContain(created.id);
  });

  it("rejects (and rolls back) when the mutation function fails permanently", async () => {
    const client = makeClient();
    const failing: FakeMutationFn = vi.fn(async () => {
      throw new Error("Forbidden");
    });
    const writer = makeWriter({ mutationFn: failing });
    collectionMocks.writer = writer;

    const { result } = renderHook(() => useCreateList(), { wrapper: wrap(client) });
    await expect(
      result.current.mutateAsync({ name: "Nope", intent: "wish", kind: "card" }),
    ).rejects.toThrow("Forbidden");
    expect(writer.lists.toArray).toHaveLength(0);
  });

  it("rejects when no writer exists (signed out)", async () => {
    const client = makeClient();
    const { result } = renderHook(() => useCreateList(), { wrapper: wrap(client) });

    await expect(
      result.current.mutateAsync({ name: "Nope", intent: "wish", kind: "card" }),
    ).rejects.toThrow("Cannot create a list while signed out");
  });
});

describe("useUpdateList", () => {
  it("applies rename and trade-default changes optimistically inside one offline tx", async () => {
    const client = makeClient();
    const writer = makeWriter();
    writer.lists.insert([makeListRow("lst-1", { name: "Old Name" })]);
    collectionMocks.writer = writer;

    const { result } = renderHook(() => useUpdateList(), { wrapper: wrap(client) });
    await result.current.mutateAsync({
      listId: "lst-1",
      name: "New Name",
      tradeDefaults: { pricePref: "cm_lowest", priceAbsoluteCents: null, tradeType: null },
    });

    expect(writer.mutationFn).toHaveBeenCalledTimes(1);
    const tx = writer.mutationFn.mock.calls[0][0].transaction;
    expect(tx.mutations).toHaveLength(1);
    expect(tx.mutations[0].changes).toEqual({
      name: "New Name",
      default_price_pref: "cm_lowest",
    });
    expect(writer.executor.opened).toEqual([{ mutationFnName: "updateLists" }]);
  });
});

describe("useDeleteList", () => {
  it("deletes the row optimistically and resolves with the id", async () => {
    const client = makeClient();
    const writer = makeWriter();
    writer.lists.insert([makeListRow("lst-1")]);
    collectionMocks.writer = writer;

    const { result } = renderHook(() => useDeleteList(), { wrapper: wrap(client) });
    const deletedId = await result.current.mutateAsync("lst-1");

    expect(deletedId).toBe("lst-1");
    const tx = writer.mutationFn.mock.calls[0][0].transaction;
    expect(tx.mutations.map((mutation) => [mutation.type, mutation.key])).toEqual([
      ["delete", "lst-1"],
    ]);
    expect(writer.executor.opened).toEqual([{ mutationFnName: "deleteLists" }]);
  });
});

describe("useReorderLists", () => {
  it("renumbers sort_order by position and sends intent + full list as tx metadata", async () => {
    const client = makeClient();
    const writer = makeWriter();
    writer.lists.insert([
      makeListRow("a", { sort_order: 0 }),
      makeListRow("b", { sort_order: 1 }),
      makeListRow("c", { sort_order: 2 }),
    ]);
    collectionMocks.writer = writer;

    const { result } = renderHook(() => useReorderLists(), { wrapper: wrap(client) });
    await result.current.mutateAsync({ intent: "wish", orderedIds: ["c", "a", "b"] });

    const tx = writer.mutationFn.mock.calls[0][0].transaction;
    const orders = new Map(
      tx.mutations.map((mutation) => [
        mutation.key,
        (mutation.modified as ListShapeRow).sort_order,
      ]),
    );
    expect(orders.get("c")).toBe(0);
    expect(orders.get("a")).toBe(1);
    expect(orders.get("b")).toBe(2);
    expect(writer.executor.opened).toEqual([
      {
        mutationFnName: "reorderLists",
        metadata: { intent: "wish", orderedIds: ["c", "a", "b"] },
      },
    ]);
  });

  it("no-ops on an empty id list", async () => {
    const client = makeClient();
    const writer = makeWriter();
    collectionMocks.writer = writer;

    const { result } = renderHook(() => useReorderLists(), { wrapper: wrap(client) });
    await result.current.mutateAsync({ intent: "wish", orderedIds: [] });

    expect(writer.mutationFn).not.toHaveBeenCalled();
  });
});

describe("useBulkAddListEntries", () => {
  it("inserts fresh targets under client ids and reports them as added", async () => {
    const client = makeClient();
    const writer = makeWriter();
    collectionMocks.writer = writer;

    const { result } = renderHook(() => useBulkAddListEntries(), { wrapper: wrap(client) });
    const counts = await result.current.mutateAsync({
      listId: "lst-1",
      entries: [{ cardId: "card-1" }, { printingId: "p-1", quantity: 2 }],
    });

    expect(counts).toEqual({ added: 2, updated: 0, skipped: 0 });
    expect(writer.executor.opened).toEqual([{ mutationFnName: "createListEntries" }]);
    const tx = writer.mutationFn.mock.calls[0][0].transaction;
    const rows = tx.mutations.map((mutation) => mutation.modified) as ListEntryShapeRow[];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      list_id: "lst-1",
      kind: "card",
      card_id: "card-1",
      quantity: 1,
    });
    expect(rows[1]).toMatchObject({ kind: "printing", printing_id: "p-1", quantity: 2 });
    expect(String(rows[0].id)).toMatch(UUID_PATTERN);
  });

  it("bumps the quantity of an existing entry instead of inserting a duplicate", async () => {
    const client = makeClient();
    const writer = makeWriter();
    writer.listEntries.insert([
      makeEntryRow("e1", { list_id: "lst-1", card_id: "card-1", quantity: 3 }),
    ]);
    collectionMocks.writer = writer;

    const { result } = renderHook(() => useBulkAddListEntries(), { wrapper: wrap(client) });
    const counts = await result.current.mutateAsync({
      listId: "lst-1",
      entries: [{ cardId: "card-1" }],
    });

    expect(counts).toEqual({ added: 0, updated: 1, skipped: 0 });
    expect(writer.executor.opened).toEqual([{ mutationFnName: "updateListEntries" }]);
    const tx = writer.mutationFn.mock.calls[0][0].transaction;
    expect(tx.mutations[0].changes).toEqual({ quantity: 4 });
  });

  it("skips re-adding a copy that is already on the list (copy entries are singular)", async () => {
    const client = makeClient();
    const writer = makeWriter();
    writer.listEntries.insert([
      makeEntryRow("e1", { list_id: "lst-1", kind: "copy", card_id: null, copy_id: "cp-1" }),
    ]);
    collectionMocks.writer = writer;

    const { result } = renderHook(() => useBulkAddListEntries(), { wrapper: wrap(client) });
    const counts = await result.current.mutateAsync({
      listId: "lst-1",
      entries: [{ copyId: "cp-1" }, { copyId: "cp-2" }],
    });

    expect(counts).toEqual({ added: 1, updated: 0, skipped: 1 });
  });

  it("merges in-batch duplicates into one pending insert", async () => {
    const client = makeClient();
    const writer = makeWriter();
    collectionMocks.writer = writer;

    const { result } = renderHook(() => useBulkAddListEntries(), { wrapper: wrap(client) });
    const counts = await result.current.mutateAsync({
      listId: "lst-1",
      entries: [{ cardId: "card-1" }, { cardId: "card-1", quantity: 2 }],
    });

    expect(counts).toEqual({ added: 1, updated: 0, skipped: 0 });
    const tx = writer.mutationFn.mock.calls[0][0].transaction;
    const rows = tx.mutations.map((mutation) => mutation.modified) as ListEntryShapeRow[];
    expect(rows).toHaveLength(1);
    expect(rows[0].quantity).toBe(3);
  });
});

describe("useUpdateListEntry", () => {
  it("applies quantity and trade-override changes optimistically", async () => {
    const client = makeClient();
    const writer = makeWriter();
    writer.listEntries.insert([makeEntryRow("e1", { quantity: 2 })]);
    collectionMocks.writer = writer;

    const { result } = renderHook(() => useUpdateListEntry(), { wrapper: wrap(client) });
    await result.current.mutateAsync({
      listId: "lst-1",
      entryId: "e1",
      quantity: 5,
      tradeOverride: { pricePref: null, priceAbsoluteCents: null, tradeType: "money" },
    });

    expect(writer.executor.opened).toEqual([{ mutationFnName: "updateListEntries" }]);
    const tx = writer.mutationFn.mock.calls[0][0].transaction;
    expect(tx.mutations[0].changes).toEqual({ quantity: 5, trade_type: "money" });
  });
});

describe("useRemoveListEntry / useBulkRemoveListEntries", () => {
  it("deletes a single entry optimistically", async () => {
    const client = makeClient();
    const writer = makeWriter();
    writer.listEntries.insert([makeEntryRow("e1")]);
    collectionMocks.writer = writer;

    const { result } = renderHook(() => useRemoveListEntry(), { wrapper: wrap(client) });
    await result.current.mutateAsync({ listId: "lst-1", entryId: "e1" });

    expect(writer.executor.opened).toEqual([{ mutationFnName: "deleteListEntries" }]);
    const tx = writer.mutationFn.mock.calls[0][0].transaction;
    expect(tx.mutations.map((mutation) => [mutation.type, mutation.key])).toEqual([
      ["delete", "e1"],
    ]);
  });

  it("deletes multiple entries in one transaction", async () => {
    const client = makeClient();
    const writer = makeWriter();
    writer.listEntries.insert([makeEntryRow("e1"), makeEntryRow("e2")]);
    collectionMocks.writer = writer;

    const { result } = renderHook(() => useBulkRemoveListEntries(), { wrapper: wrap(client) });
    await result.current.mutateAsync({ listId: "lst-1", entryIds: ["e1", "e2"] });

    const tx = writer.mutationFn.mock.calls[0][0].transaction;
    expect(tx.mutations.map((mutation) => mutation.key)).toEqual(["e1", "e2"]);
  });

  it("no-ops on an empty id list", async () => {
    const client = makeClient();
    const writer = makeWriter();
    collectionMocks.writer = writer;

    const { result } = renderHook(() => useBulkRemoveListEntries(), { wrapper: wrap(client) });
    await result.current.mutateAsync({ listId: "lst-1", entryIds: [] });

    expect(writer.mutationFn).not.toHaveBeenCalled();
  });
});

import { NonRetriableError } from "@tanstack/offline-transactions";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createListOfflineMutationFns } from "./lists-offline";
import type {
  ListEntriesWriteCollection,
  ListEntryShapeRow,
  ListShapeRow,
  ListsWriteCollection,
} from "./lists-offline";
import { queryKeys } from "./query-keys";

let queryClient: QueryClient;

const userA = "user-a";

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});

afterEach(() => {
  queryClient.clear();
  vi.restoreAllMocks();
});

interface RecordedRequest {
  url: string;
  method: string;
  body: unknown;
}

let requests: RecordedRequest[];
const originalFetch = globalThis.fetch;

function mockApi(respond: (url: string, body: unknown) => { status: number; json: unknown }) {
  requests = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const method = input instanceof Request ? input.method : (init?.method ?? "GET");
    const raw = input instanceof Request ? await input.text() : String(init?.body ?? "");
    const body = raw ? JSON.parse(raw) : undefined;
    requests.push({ url, method, body });
    const { status, json } = respond(url, body);
    return Response.json(json, { status });
  }) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function makeListRow(id: string, overrides: Partial<ListShapeRow> = {}): ListShapeRow {
  return {
    id,
    name: "Wants",
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
    card_id: "card-1",
    printing_id: null,
    copy_id: null,
    quantity: 1,
    price_pref: null,
    price_absolute_cents: null,
    trade_type: null,
    ...overrides,
  };
}

// The mutation functions only touch utils.awaitTxId on each collection.
function fakeCollections() {
  const listsAwaitTxId = vi.fn(async (_txid: number) => true);
  const entriesAwaitTxId = vi.fn(async (_txid: number) => true);
  return {
    listsAwaitTxId,
    entriesAwaitTxId,
    lists: { utils: { awaitTxId: listsAwaitTxId } } as unknown as ListsWriteCollection,
    listEntries: {
      utils: { awaitTxId: entriesAwaitTxId },
    } as unknown as ListEntriesWriteCollection,
  };
}

function createFns(lists: ListsWriteCollection, listEntries: ListEntriesWriteCollection) {
  return createListOfflineMutationFns(queryClient, userA, lists, listEntries);
}

describe("createLists", () => {
  it("POSTs the row (with its client-generated id and trade defaults) and awaits the txid", async () => {
    mockApi(() => ({ status: 201, json: { id: "lst-1", txid: 42 } }));
    const { lists, listEntries, listsAwaitTxId } = fakeCollections();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    await createFns(lists, listEntries).createLists({
      transaction: {
        mutations: [
          {
            key: "lst-1",
            modified: makeListRow("lst-1", {
              name: "Trades",
              intent: "trade",
              kind: "copy",
              default_trade_type: "cards",
              currency: "EUR",
            }),
          },
        ],
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain("/api/v1/lists");
    expect(requests[0].body).toEqual({
      id: "lst-1",
      name: "Trades",
      intent: "trade",
      kind: "copy",
      tradeDefaults: { pricePref: null, priceAbsoluteCents: null, tradeType: "cards" },
      currency: "EUR",
    });
    expect(listsAwaitTxId).toHaveBeenCalledWith(42);
    expect(invalidateSpy.mock.calls.map(([arg]) => arg?.queryKey)).toContainEqual(
      queryKeys.lists.all(userA),
    );
  });

  // Replay tolerance: a retried transaction whose first attempt landed gets
  // 409 from the API (client-generated ids make the insert idempotent).
  it("treats a 409 (already applied) as success", async () => {
    mockApi(() => ({ status: 409, json: { error: "List already exists", code: "CONFLICT" } }));
    const { lists, listEntries, listsAwaitTxId } = fakeCollections();

    await expect(
      createFns(lists, listEntries).createLists({
        transaction: { mutations: [{ key: "lst-1", modified: makeListRow("lst-1") }] },
      }),
    ).resolves.toBeUndefined();
    expect(listsAwaitTxId).not.toHaveBeenCalled();
  });

  it("maps other 4xx responses to NonRetriableError", async () => {
    mockApi(() => ({ status: 400, json: { error: "Bad request", code: "BAD_REQUEST" } }));
    const { lists, listEntries } = fakeCollections();

    await expect(
      createFns(lists, listEntries).createLists({
        transaction: { mutations: [{ key: "lst-1", modified: makeListRow("lst-1") }] },
      }),
    ).rejects.toBeInstanceOf(NonRetriableError);
  });

  it("keeps network failures retriable (plain error, not NonRetriableError)", async () => {
    requests = [];
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;
    const { lists, listEntries } = fakeCollections();

    const failure = await createFns(lists, listEntries)
      .createLists({
        transaction: { mutations: [{ key: "lst-1", modified: makeListRow("lst-1") }] },
      })
      .then(
        () => null,
        (error: unknown) => error,
      );

    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(NonRetriableError);
    expect((failure as Error).message).toContain("Can't reach the server");
  });
});

describe("updateLists", () => {
  it("PATCHes only the changed field groups and awaits the txid", async () => {
    mockApi(() => ({ status: 200, json: { id: "lst-1", txid: 7 } }));
    const { lists, listEntries, listsAwaitTxId } = fakeCollections();

    await createFns(lists, listEntries).updateLists({
      transaction: {
        mutations: [
          {
            key: "lst-1",
            modified: makeListRow("lst-1", { name: "Renamed" }),
            changes: { name: "Renamed" },
          },
        ],
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("PATCH");
    expect(requests[0].url).toContain("/api/v1/lists/lst-1");
    expect(requests[0].body).toEqual({ name: "Renamed" });
    expect(listsAwaitTxId).toHaveBeenCalledWith(7);
  });

  it("sends the full trade-default triple when any of its columns changed", async () => {
    mockApi(() => ({ status: 200, json: { id: "lst-1", txid: 7 } }));
    const { lists, listEntries } = fakeCollections();

    await createFns(lists, listEntries).updateLists({
      transaction: {
        mutations: [
          {
            key: "lst-1",
            modified: makeListRow("lst-1", {
              default_price_pref: "cm_lowest",
              default_trade_type: "cards",
            }),
            changes: { default_price_pref: "cm_lowest" },
          },
        ],
      },
    });

    expect(requests[0].body).toEqual({
      tradeDefaults: { pricePref: "cm_lowest", priceAbsoluteCents: null, tradeType: "cards" },
    });
  });

  it("skips mutations whose changes carry no patchable field", async () => {
    mockApi(() => ({ status: 200, json: { txid: 7 } }));
    const { lists, listEntries } = fakeCollections();

    await createFns(lists, listEntries).updateLists({
      transaction: {
        mutations: [
          { key: "lst-1", modified: makeListRow("lst-1", { sort_order: 3 }), changes: {} },
        ],
      },
    });

    expect(requests).toHaveLength(0);
  });

  it("maps a 404 (list vanished) to NonRetriableError", async () => {
    mockApi(() => ({ status: 404, json: { error: "Not found", code: "NOT_FOUND" } }));
    const { lists, listEntries } = fakeCollections();

    await expect(
      createFns(lists, listEntries).updateLists({
        transaction: {
          mutations: [
            { key: "lst-1", modified: makeListRow("lst-1"), changes: { name: "Renamed" } },
          ],
        },
      }),
    ).rejects.toBeInstanceOf(NonRetriableError);
  });
});

describe("deleteLists", () => {
  it("DELETEs the list and awaits the txid", async () => {
    mockApi(() => ({ status: 200, json: { txid: 9 } }));
    const { lists, listEntries, listsAwaitTxId } = fakeCollections();

    await createFns(lists, listEntries).deleteLists({
      transaction: { mutations: [{ key: "gone-1", modified: makeListRow("gone-1") }] },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("DELETE");
    expect(requests[0].url).toContain("/api/v1/lists/gone-1");
    expect(listsAwaitTxId).toHaveBeenCalledWith(9);
  });

  // Replay tolerance: the list being gone IS the desired end state.
  it("treats a 404 (already gone) as success", async () => {
    mockApi(() => ({ status: 404, json: { error: "Not found", code: "NOT_FOUND" } }));
    const { lists, listEntries, listsAwaitTxId } = fakeCollections();

    await expect(
      createFns(lists, listEntries).deleteLists({
        transaction: { mutations: [{ key: "gone-1", modified: makeListRow("gone-1") }] },
      }),
    ).resolves.toBeUndefined();
    expect(listsAwaitTxId).not.toHaveBeenCalled();
  });
});

describe("reorderLists", () => {
  it("POSTs the intent and the full ordered list from the tx metadata", async () => {
    mockApi(() => ({ status: 200, json: { txid: 11 } }));
    const { lists, listEntries, listsAwaitTxId } = fakeCollections();

    await createFns(lists, listEntries).reorderLists({
      transaction: {
        // Only one row actually changed sort_order…
        mutations: [
          {
            key: "b",
            modified: makeListRow("b", { sort_order: 1 }),
            changes: { sort_order: 1 },
          },
        ],
        // …but the server renumbers exactly the ids it receives, so the
        // intent bucket and full list ride in the metadata.
        metadata: { intent: "wish", orderedIds: ["a", "b", "c"] },
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain("/api/v1/lists/reorder");
    expect(requests[0].body).toEqual({ intent: "wish", orderedIds: ["a", "b", "c"] });
    expect(listsAwaitTxId).toHaveBeenCalledWith(11);
  });

  it("no-ops when the metadata carries no intent or ids", async () => {
    mockApi(() => ({ status: 200, json: { txid: 11 } }));
    const { lists, listEntries } = fakeCollections();

    await createFns(lists, listEntries).reorderLists({
      transaction: { mutations: [] },
    });
    await createFns(lists, listEntries).reorderLists({
      transaction: { mutations: [], metadata: { orderedIds: ["a"] } },
    });

    expect(requests).toHaveLength(0);
  });
});

describe("createListEntries", () => {
  it("groups rows by list and POSTs one bulk request per list with client ids", async () => {
    mockApi(() => ({ status: 200, json: { added: 1, updated: 0, skipped: 0, txid: 21 } }));
    const { lists, listEntries, entriesAwaitTxId } = fakeCollections();

    await createFns(lists, listEntries).createListEntries({
      transaction: {
        mutations: [
          { key: "e1", modified: makeEntryRow("e1", { list_id: "lst-1", quantity: 2 }) },
          {
            key: "e2",
            modified: makeEntryRow("e2", {
              list_id: "lst-2",
              kind: "printing",
              card_id: null,
              printing_id: "p-1",
            }),
          },
        ],
      },
    });

    expect(requests).toHaveLength(2);
    expect(requests[0].url).toContain("/api/v1/lists/lst-1/entries/bulk");
    expect(requests[0].body).toEqual({
      entries: [
        {
          id: "e1",
          cardId: "card-1",
          quantity: 2,
          tradeOverride: { pricePref: null, priceAbsoluteCents: null, tradeType: null },
        },
      ],
    });
    expect(requests[1].url).toContain("/api/v1/lists/lst-2/entries/bulk");
    expect(requests[1].body).toEqual({
      entries: [
        {
          id: "e2",
          printingId: "p-1",
          quantity: 1,
          tradeOverride: { pricePref: null, priceAbsoluteCents: null, tradeType: null },
        },
      ],
    });
    expect(entriesAwaitTxId).toHaveBeenCalledWith(21);
  });

  it("maps a 404 (list vanished) to NonRetriableError", async () => {
    mockApi(() => ({ status: 404, json: { error: "List not found", code: "NOT_FOUND" } }));
    const { lists, listEntries } = fakeCollections();

    await expect(
      createFns(lists, listEntries).createListEntries({
        transaction: { mutations: [{ key: "e1", modified: makeEntryRow("e1") }] },
      }),
    ).rejects.toBeInstanceOf(NonRetriableError);
  });
});

describe("updateListEntries", () => {
  it("PATCHes quantity (and the full override triple when it changed) per entry", async () => {
    mockApi(() => ({ status: 200, json: { id: "e1", txid: 31 } }));
    const { lists, listEntries, entriesAwaitTxId } = fakeCollections();

    await createFns(lists, listEntries).updateListEntries({
      transaction: {
        mutations: [
          {
            key: "e1",
            modified: makeEntryRow("e1", { quantity: 5, trade_type: "money" }),
            changes: { quantity: 5, trade_type: "money" },
          },
        ],
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("PATCH");
    expect(requests[0].url).toContain("/api/v1/lists/lst-1/entries/e1");
    expect(requests[0].body).toEqual({
      quantity: 5,
      tradeOverride: { pricePref: null, priceAbsoluteCents: null, tradeType: "money" },
    });
    expect(entriesAwaitTxId).toHaveBeenCalledWith(31);
  });

  it("maps a 404 (entry vanished) to NonRetriableError", async () => {
    mockApi(() => ({ status: 404, json: { error: "Not found", code: "NOT_FOUND" } }));
    const { lists, listEntries } = fakeCollections();

    await expect(
      createFns(lists, listEntries).updateListEntries({
        transaction: {
          mutations: [{ key: "e1", modified: makeEntryRow("e1"), changes: { quantity: 2 } }],
        },
      }),
    ).rejects.toBeInstanceOf(NonRetriableError);
  });
});

describe("deleteListEntries", () => {
  it("groups ids by list and POSTs one bulk-delete per list, awaiting the txid", async () => {
    mockApi(() => ({ status: 200, json: { txid: 41 } }));
    const { lists, listEntries, entriesAwaitTxId } = fakeCollections();

    await createFns(lists, listEntries).deleteListEntries({
      transaction: {
        mutations: [
          { key: "e1", modified: makeEntryRow("e1", { list_id: "lst-1" }) },
          { key: "e2", modified: makeEntryRow("e2", { list_id: "lst-1" }) },
          { key: "e3", modified: makeEntryRow("e3", { list_id: "lst-2" }) },
        ],
      },
    });

    expect(requests).toHaveLength(2);
    expect(requests[0].url).toContain("/api/v1/lists/lst-1/entries/bulk-delete");
    expect(requests[0].body).toEqual({ entryIds: ["e1", "e2"] });
    expect(requests[1].url).toContain("/api/v1/lists/lst-2/entries/bulk-delete");
    expect(requests[1].body).toEqual({ entryIds: ["e3"] });
    expect(entriesAwaitTxId).toHaveBeenCalledWith(41);
  });

  // Replay tolerance: the owning list (and its entries) being gone IS the
  // desired end state; stale entry ids are filtered server-side and never 404.
  it("treats a 404 (list already gone) as success", async () => {
    mockApi(() => ({ status: 404, json: { error: "List not found", code: "NOT_FOUND" } }));
    const { lists, listEntries, entriesAwaitTxId } = fakeCollections();

    await expect(
      createFns(lists, listEntries).deleteListEntries({
        transaction: { mutations: [{ key: "e1", modified: makeEntryRow("e1") }] },
      }),
    ).resolves.toBeUndefined();
    expect(entriesAwaitTxId).not.toHaveBeenCalled();
  });
});

describe("txid stream lag", () => {
  it("does not fail the transaction when the txid await itself times out", async () => {
    mockApi(() => ({ status: 201, json: { txid: 42 } }));
    const { listEntries } = fakeCollections();
    const awaitTxId = vi.fn(async () => {
      throw new Error("Timeout waiting for txId: 42");
    });
    const lists = { utils: { awaitTxId } } as unknown as ListsWriteCollection;

    await expect(
      createFns(lists, listEntries).createLists({
        transaction: { mutations: [{ key: "lst-1", modified: makeListRow("lst-1") }] },
      }),
    ).resolves.toBeUndefined();
  });
});

import { NonRetriableError } from "@tanstack/offline-transactions";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createCollectionOfflineMutationFns } from "./collections-offline";
import type { CollectionShapeRow, CollectionsWriteCollection } from "./collections-offline";
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

function makeRow(id: string, overrides: Partial<CollectionShapeRow> = {}): CollectionShapeRow {
  return {
    id,
    group_id: null,
    name: "Binder",
    description: null,
    is_inbox: false,
    sort_order: 0,
    ...overrides,
  };
}

// The mutation functions only touch utils.awaitTxId on the collection.
function fakeCollection() {
  const awaitTxId = vi.fn(async (_txid: number) => true);
  return {
    awaitTxId,
    collection: { utils: { awaitTxId } } as unknown as CollectionsWriteCollection,
  };
}

function createFns(collection: CollectionsWriteCollection) {
  return createCollectionOfflineMutationFns(queryClient, userA, collection);
}

describe("createCollections", () => {
  it("POSTs the row (with its client-generated id) plus the tx metadata and awaits the txid", async () => {
    mockApi(() => ({ status: 201, json: { id: "col-1", txid: 42 } }));
    const { awaitTxId, collection } = fakeCollection();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    await createFns(collection).createCollections({
      transaction: {
        mutations: [{ key: "col-1", modified: makeRow("col-1", { name: "New Binder" }) }],
        metadata: { groupSlug: "friday-night" },
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain("/api/v1/collections");
    expect(requests[0].body).toEqual({
      id: "col-1",
      name: "New Binder",
      description: null,
      groupSlug: "friday-night",
    });
    expect(awaitTxId).toHaveBeenCalledWith(42);
    expect(invalidateSpy.mock.calls.map(([arg]) => arg?.queryKey)).toContainEqual(
      queryKeys.collections.all(userA),
    );
  });

  // Replay tolerance: a retried transaction whose first attempt landed gets
  // 409 from the API (client-generated ids make the insert idempotent).
  it("treats a 409 (already applied) as success", async () => {
    mockApi(() => ({
      status: 409,
      json: { error: "Collection already exists", code: "CONFLICT" },
    }));
    const { awaitTxId, collection } = fakeCollection();

    await expect(
      createFns(collection).createCollections({
        transaction: { mutations: [{ key: "col-1", modified: makeRow("col-1") }] },
      }),
    ).resolves.toBeUndefined();
    expect(awaitTxId).not.toHaveBeenCalled();
  });

  it("maps other 4xx responses to NonRetriableError", async () => {
    mockApi(() => ({ status: 403, json: { error: "Forbidden", code: "FORBIDDEN" } }));
    const { collection } = fakeCollection();

    await expect(
      createFns(collection).createCollections({
        transaction: { mutations: [{ key: "col-1", modified: makeRow("col-1") }] },
      }),
    ).rejects.toBeInstanceOf(NonRetriableError);
  });

  it("keeps network failures retriable (plain error, not NonRetriableError)", async () => {
    requests = [];
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;
    const { collection } = fakeCollection();

    const failure = await createFns(collection)
      .createCollections({
        transaction: { mutations: [{ key: "col-1", modified: makeRow("col-1") }] },
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

describe("updateCollections", () => {
  it("PATCHes only the changed fields and awaits the txid", async () => {
    mockApi(() => ({ status: 200, json: { id: "col-1", txid: 7 } }));
    const { awaitTxId, collection } = fakeCollection();

    await createFns(collection).updateCollections({
      transaction: {
        mutations: [
          {
            key: "col-1",
            modified: makeRow("col-1", { name: "Renamed" }),
            changes: { name: "Renamed" },
          },
        ],
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("PATCH");
    expect(requests[0].url).toContain("/api/v1/collections/col-1");
    expect(requests[0].body).toEqual({ name: "Renamed" });
    expect(awaitTxId).toHaveBeenCalledWith(7);
  });

  it("skips mutations whose changes carry no patchable field", async () => {
    mockApi(() => ({ status: 200, json: { txid: 7 } }));
    const { collection } = fakeCollection();

    await createFns(collection).updateCollections({
      transaction: {
        mutations: [{ key: "col-1", modified: makeRow("col-1", { sort_order: 3 }), changes: {} }],
      },
    });

    expect(requests).toHaveLength(0);
  });

  it("maps a 404 (collection vanished) to NonRetriableError", async () => {
    mockApi(() => ({ status: 404, json: { error: "Not found", code: "NOT_FOUND" } }));
    const { collection } = fakeCollection();

    await expect(
      createFns(collection).updateCollections({
        transaction: {
          mutations: [{ key: "col-1", modified: makeRow("col-1"), changes: { name: "Renamed" } }],
        },
      }),
    ).rejects.toBeInstanceOf(NonRetriableError);
  });
});

describe("deleteCollections", () => {
  it("DELETEs the collection and awaits the txid", async () => {
    mockApi(() => ({ status: 200, json: { txid: 9 } }));
    const { awaitTxId, collection } = fakeCollection();

    await createFns(collection).deleteCollections({
      transaction: { mutations: [{ key: "gone-1", modified: makeRow("gone-1") }] },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("DELETE");
    expect(requests[0].url).toContain("/api/v1/collections/gone-1");
    expect(awaitTxId).toHaveBeenCalledWith(9);
  });

  // Replay tolerance: the collection being gone IS the desired end state.
  it("treats a 404 (already gone) as success", async () => {
    mockApi(() => ({ status: 404, json: { error: "Not found", code: "NOT_FOUND" } }));
    const { awaitTxId, collection } = fakeCollection();

    await expect(
      createFns(collection).deleteCollections({
        transaction: { mutations: [{ key: "gone-1", modified: makeRow("gone-1") }] },
      }),
    ).resolves.toBeUndefined();
    expect(awaitTxId).not.toHaveBeenCalled();
  });

  it("maps a 409 (inbox / non-empty shared collection) to NonRetriableError", async () => {
    mockApi(() => ({
      status: 409,
      json: { error: "Cannot delete inbox collection", code: "CONFLICT" },
    }));
    const { collection } = fakeCollection();

    await expect(
      createFns(collection).deleteCollections({
        transaction: { mutations: [{ key: "inbox-1", modified: makeRow("inbox-1") }] },
      }),
    ).rejects.toBeInstanceOf(NonRetriableError);
  });
});

describe("reorderCollections", () => {
  it("POSTs the full ordered list from the tx metadata, not just the mutated rows", async () => {
    mockApi(() => ({ status: 200, json: { txid: 11 } }));
    const { awaitTxId, collection } = fakeCollection();

    await createFns(collection).reorderCollections({
      transaction: {
        // Only one row actually changed sort_order…
        mutations: [
          { key: "b", modified: makeRow("b", { sort_order: 1 }), changes: { sort_order: 1 } },
        ],
        // …but the server renumbers exactly the ids it receives, so the full
        // list rides in the metadata.
        metadata: { orderedIds: ["a", "b", "c"] },
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain("/api/v1/collections/reorder");
    expect(requests[0].body).toEqual({ orderedIds: ["a", "b", "c"] });
    expect(awaitTxId).toHaveBeenCalledWith(11);
  });

  it("no-ops when the metadata carries no ordered ids", async () => {
    mockApi(() => ({ status: 200, json: { txid: 11 } }));
    const { collection } = fakeCollection();

    await createFns(collection).reorderCollections({
      transaction: { mutations: [] },
    });

    expect(requests).toHaveLength(0);
  });

  it("maps 4xx responses to NonRetriableError", async () => {
    mockApi(() => ({ status: 400, json: { error: "Bad request", code: "BAD_REQUEST" } }));
    const { collection } = fakeCollection();

    await expect(
      createFns(collection).reorderCollections({
        transaction: { mutations: [], metadata: { orderedIds: ["a"] } },
      }),
    ).rejects.toBeInstanceOf(NonRetriableError);
  });
});

describe("txid stream lag", () => {
  it("does not fail the transaction when the txid await itself times out", async () => {
    mockApi(() => ({ status: 201, json: { txid: 42 } }));
    const awaitTxId = vi.fn(async () => {
      throw new Error("Timeout waiting for txId: 42");
    });
    const collection = { utils: { awaitTxId } } as unknown as CollectionsWriteCollection;

    await expect(
      createFns(collection).createCollections({
        transaction: { mutations: [{ key: "col-1", modified: makeRow("col-1") }] },
      }),
    ).resolves.toBeUndefined();
  });
});

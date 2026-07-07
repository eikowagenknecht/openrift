import { SingleProcessCoordinator } from "@tanstack/db-sqlite-persistence-core";
import type { PersistedCollectionPersistence } from "@tanstack/db-sqlite-persistence-core";
import { NonRetriableError } from "@tanstack/offline-transactions";
import { createLiveQueryCollection } from "@tanstack/react-db";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { stubCopyShapeRow } from "../test/factories.js";
import {
  createCopyOfflineMutationFns,
  getCopiesCollection,
  releaseCopiesCollection,
} from "./copies-collection";
import type { CopiesWriteCollection } from "./copies-collection";
import { queryKeys } from "./query-keys";

let queryClient: QueryClient;

const userA = "user-a";
const userB = "user-b";

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});

afterEach(() => {
  queryClient.clear();
});

describe("getCopiesCollection", () => {
  it("returns the same collection for the same (queryClient, userId)", () => {
    const a = getCopiesCollection(queryClient, userA);
    const b = getCopiesCollection(queryClient, userA);
    expect(a).toBe(b);
  });

  it("returns a different collection when the active userId changes", () => {
    const a = getCopiesCollection(queryClient, userA);
    const b = getCopiesCollection(queryClient, userB);
    expect(a).not.toBe(b);
  });

  it("isolates collections across QueryClients", () => {
    const a = getCopiesCollection(queryClient, userA);
    const other = new QueryClient();
    const b = getCopiesCollection(other, userA);
    expect(a).not.toBe(b);
    other.clear();
  });

  it("uses a per-user queryKey so two users' caches never share a slot", () => {
    queryClient.setQueryData(queryKeys.copies.all(userA), { items: [{ id: "alice-1" }] });
    queryClient.setQueryData(queryKeys.copies.all(userB), { items: [{ id: "bob-1" }] });

    expect(queryClient.getQueryData(queryKeys.copies.all(userA))).toEqual({
      items: [{ id: "alice-1" }],
    });
    expect(queryClient.getQueryData(queryKeys.copies.all(userB))).toEqual({
      items: [{ id: "bob-1" }],
    });
  });

  // Regression: signing out flooded the console with `[Live Query Error]`
  // because the previous architecture called `cleanup()` on the singleton
  // copies collection while live-query subscribers were still attached.
  // With per-user collection identity, sign-out / sign-in just changes the
  // userId; the previous user's collection is not torn down by us — it's
  // orphaned and auto-GC'd when subscribers naturally detach. No warning.
  it("does not surface [Live Query Error] when the active user changes mid-subscription", async () => {
    queryClient.setQueryData(queryKeys.copies.all(userA), { items: [], nextCursor: null });
    const aliceCopies = getCopiesCollection(queryClient, userA);

    const liveQuery = createLiveQueryCollection({
      query: (q) => q.from({ copy: aliceCopies }),
      startSync: true,
    });
    const subscription = liveQuery.subscribeChanges(() => {});
    await vi.waitFor(() => expect(aliceCopies.subscriberCount).toBeGreaterThan(0));

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      // Active user switches to userB. The previous user's collection becomes
      // orphaned — not touched, just no longer cached. Subscribers stay
      // attached until the consumer unmounts.
      getCopiesCollection(queryClient, userB);

      // Mimic the consumer unmount: detach the live query.
      subscription.unsubscribe();
      await liveQuery.cleanup();

      const liveQueryErrors = errorSpy.mock.calls.filter(
        (call) => typeof call[0] === "string" && call[0].includes("[Live Query Error]"),
      );
      expect(liveQueryErrors).toEqual([]);
    } finally {
      errorSpy.mockRestore();
    }
  });
});

describe("releaseCopiesCollection", () => {
  it("is a no-op when no collection is cached", () => {
    expect(() => {
      releaseCopiesCollection(queryClient);
    }).not.toThrow();
  });

  it("drops the cached collection so the next request creates a fresh one", () => {
    const before = getCopiesCollection(queryClient, userA);
    releaseCopiesCollection(queryClient);
    const after = getCopiesCollection(queryClient, userA);
    expect(after).not.toBe(before);
  });

  it("does not surface [Live Query Error] when released mid-subscription", async () => {
    queryClient.setQueryData(queryKeys.copies.all(userA), { items: [], nextCursor: null });
    const collection = getCopiesCollection(queryClient, userA);
    const liveQuery = createLiveQueryCollection({
      query: (q) => q.from({ copy: collection }),
      startSync: true,
    });
    const subscription = liveQuery.subscribeChanges(() => {});
    await vi.waitFor(() => expect(collection.subscriberCount).toBeGreaterThan(0));

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      releaseCopiesCollection(queryClient);

      subscription.unsubscribe();
      await liveQuery.cleanup();

      const liveQueryErrors = errorSpy.mock.calls.filter(
        (call) => typeof call[0] === "string" && call[0].includes("[Live Query Error]"),
      );
      expect(liveQueryErrors).toEqual([]);
    } finally {
      errorSpy.mockRestore();
    }
  });
});

describe("getCopiesCollection with persistence", () => {
  function createFakePersistence() {
    const adapter = {
      loadSubset: vi.fn().mockResolvedValue([]),
      applyCommittedTx: vi.fn().mockResolvedValue(undefined),
      ensureIndex: vi.fn().mockResolvedValue(undefined),
      loadCollectionMetadata: vi.fn().mockResolvedValue([]),
    };
    const persistence = {
      adapter,
      coordinator: new SingleProcessCoordinator(),
    } as unknown as PersistedCollectionPersistence;
    return { adapter, persistence };
  }

  it("returns a stable identity for the persisted collection", () => {
    const { persistence } = createFakePersistence();
    const a = getCopiesCollection(queryClient, userA, persistence);
    const b = getCopiesCollection(queryClient, userA, persistence);
    expect(a).toBe(b);
  });

  it("hydrates from the local persistence adapter once subscribed", async () => {
    queryClient.setQueryData(queryKeys.copies.all(userA), { items: [], nextCursor: null });
    const { adapter, persistence } = createFakePersistence();
    const collection = getCopiesCollection(queryClient, userA, persistence);

    const liveQuery = createLiveQueryCollection({
      query: (q) => q.from({ copy: collection }),
      startSync: true,
    });
    const subscription = liveQuery.subscribeChanges(() => {});
    try {
      await vi.waitFor(() => expect(adapter.loadSubset).toHaveBeenCalled());
      expect(adapter.loadSubset.mock.calls[0][0]).toBe(`copies:${userA}`);
    } finally {
      subscription.unsubscribe();
      await liveQuery.cleanup();
    }
  });
});

describe("createCopyOfflineMutationFns", () => {
  interface RecordedRequest {
    url: string;
    body: unknown;
  }

  let requests: RecordedRequest[];
  const originalFetch = globalThis.fetch;

  function mockApi(respond: (url: string, body: unknown) => { status: number; json: unknown }) {
    requests = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      const raw = input instanceof Request ? await input.text() : String(init?.body ?? "");
      const body = raw ? JSON.parse(raw) : undefined;
      requests.push({ url, body });
      const { status, json } = respond(url, body);
      return Response.json(json, { status });
    }) as typeof fetch;
  }

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function makeRow(id: string, collectionId = "col-1", printingId = "pr-1") {
    return stubCopyShapeRow({ id, collection_id: collectionId, printing_id: printingId });
  }

  // The mutation functions only touch utils.awaitTxId on the collection.
  function fakeCollection() {
    const awaitTxId = vi.fn(async (_txid: number) => true);
    return {
      awaitTxId,
      collection: { utils: { awaitTxId } } as unknown as CopiesWriteCollection,
    };
  }

  function createFns(collection: CopiesWriteCollection) {
    return createCopyOfflineMutationFns(queryClient, userA, collection);
  }

  it("addCopies POSTs the rows in API shape and awaits the response txid", async () => {
    mockApi(() => ({ status: 201, json: { items: [], txid: 42 } }));
    const { awaitTxId, collection } = fakeCollection();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    await createFns(collection).addCopies({
      transaction: { mutations: [{ key: "id-1", modified: makeRow("id-1") }] },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain("/api/v1/copies");
    expect(requests[0].body).toEqual({
      copies: [
        {
          id: "id-1",
          printingId: "pr-1",
          collectionId: "col-1",
          // The ADR-038 metadata rides along so CSV-import conditions persist
          // at insert time.
          condition: null,
          grader: null,
          grade: null,
          notesPublic: null,
          notesPrivate: null,
          isAltered: false,
          links: [],
        },
      ],
    });
    expect(awaitTxId).toHaveBeenCalledWith(42);
    expect(invalidateSpy.mock.calls.map(([arg]) => arg?.queryKey)).toContainEqual(
      queryKeys.collections.all(userA),
    );
  });

  it("addCopies chunks more than 500 rows into multiple POSTs and awaits every txid", async () => {
    let nextTxid = 100;
    mockApi(() => ({ status: 201, json: { items: [], txid: nextTxid++ } }));
    const { awaitTxId, collection } = fakeCollection();

    const mutations = Array.from({ length: 501 }, (_, index) => ({
      key: `id-${index}`,
      modified: makeRow(`id-${index}`),
    }));
    await createFns(collection).addCopies({ transaction: { mutations } });

    expect(requests).toHaveLength(2);
    expect((requests[0].body as { copies: unknown[] }).copies).toHaveLength(500);
    expect((requests[1].body as { copies: unknown[] }).copies).toHaveLength(1);
    expect(awaitTxId.mock.calls.map(([txid]) => txid).toSorted()).toEqual([100, 101]);
  });

  // Replay tolerance: a retried transaction whose first attempt landed gets
  // 409 from the API (client-generated ids make the insert idempotent). That
  // must settle as "already applied", not as a failure.
  it("addCopies treats a 409 (already applied) as success", async () => {
    mockApi(() => ({
      status: 409,
      json: { error: "One or more copies already exist", code: "CONFLICT" },
    }));
    const { awaitTxId, collection } = fakeCollection();

    await expect(
      createFns(collection).addCopies({
        transaction: { mutations: [{ key: "id-1", modified: makeRow("id-1") }] },
      }),
    ).resolves.toBeUndefined();
    expect(awaitTxId).not.toHaveBeenCalled();
  });

  it("addCopies maps other 4xx responses to NonRetriableError", async () => {
    mockApi(() => ({ status: 403, json: { error: "Forbidden", code: "FORBIDDEN" } }));
    const { collection } = fakeCollection();

    await expect(
      createFns(collection).addCopies({
        transaction: { mutations: [{ key: "id-1", modified: makeRow("id-1") }] },
      }),
    ).rejects.toBeInstanceOf(NonRetriableError);
  });

  it("addCopies keeps network failures retriable (plain error, not NonRetriableError)", async () => {
    requests = [];
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;
    const { collection } = fakeCollection();

    const failure = await createFns(collection)
      .addCopies({ transaction: { mutations: [{ key: "id-1", modified: makeRow("id-1") }] } })
      .then(
        () => null,
        (error: unknown) => error,
      );

    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(NonRetriableError);
    expect((failure as Error).message).toContain("Can't reach the server");
  });

  it("moveCopies groups by target collection and POSTs one move per target", async () => {
    let nextTxid = 7;
    mockApi(() => ({ status: 200, json: { txid: nextTxid++ } }));
    const { awaitTxId, collection } = fakeCollection();

    await createFns(collection).moveCopies({
      transaction: {
        mutations: [
          { key: "a", modified: makeRow("a", "col-X") },
          { key: "b", modified: makeRow("b", "col-Y") },
          { key: "c", modified: makeRow("c", "col-X") },
        ],
      },
    });

    expect(requests).toHaveLength(2);
    const moveBodies = requests.map((request) => request.body) as {
      copyIds: string[];
      toCollectionId: string;
    }[];
    expect(moveBodies).toContainEqual({ copyIds: ["a", "c"], toCollectionId: "col-X" });
    expect(moveBodies).toContainEqual({ copyIds: ["b"], toCollectionId: "col-Y" });
    expect(requests.every((request) => request.url.includes("/copies/move"))).toBe(true);
    expect(awaitTxId.mock.calls.map(([txid]) => txid).toSorted()).toEqual([7, 8]);
  });

  it("moveCopies maps a 404 (copies vanished) to NonRetriableError", async () => {
    mockApi(() => ({
      status: 404,
      json: { error: "One or more copies not found", code: "NOT_FOUND" },
    }));
    const { collection } = fakeCollection();

    await expect(
      createFns(collection).moveCopies({
        transaction: { mutations: [{ key: "a", modified: makeRow("a", "col-X") }] },
      }),
    ).rejects.toBeInstanceOf(NonRetriableError);
  });

  it("disposeCopies POSTs the ids and awaits the txid", async () => {
    mockApi(() => ({ status: 200, json: { txid: 9 } }));
    const { awaitTxId, collection } = fakeCollection();

    await createFns(collection).disposeCopies({
      transaction: { mutations: [{ key: "gone-1", modified: makeRow("gone-1") }] },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain("/copies/dispose");
    expect(requests[0].body).toEqual({ copyIds: ["gone-1"] });
    expect(awaitTxId).toHaveBeenCalledWith(9);
  });

  // Replay tolerance: the copies being gone IS the desired end state.
  it("disposeCopies treats a 404 (already gone) as success", async () => {
    mockApi(() => ({
      status: 404,
      json: { error: "One or more copies not found", code: "NOT_FOUND" },
    }));
    const { awaitTxId, collection } = fakeCollection();

    await expect(
      createFns(collection).disposeCopies({
        transaction: { mutations: [{ key: "gone-1", modified: makeRow("gone-1") }] },
      }),
    ).resolves.toBeUndefined();
    expect(awaitTxId).not.toHaveBeenCalled();
  });

  it("disposeCopies maps a 409 (trade-reserved) to NonRetriableError", async () => {
    mockApi(() => ({
      status: 409,
      json: { error: "This card is reserved in an active trade", code: "CONFLICT" },
    }));
    const { collection } = fakeCollection();

    await expect(
      createFns(collection).disposeCopies({
        transaction: { mutations: [{ key: "gone-1", modified: makeRow("gone-1") }] },
      }),
    ).rejects.toBeInstanceOf(NonRetriableError);
  });

  it("does not fail the transaction when the txid await itself times out", async () => {
    mockApi(() => ({ status: 201, json: { items: [], txid: 42 } }));
    const awaitTxId = vi.fn(async () => {
      throw new Error("Timeout waiting for txId: 42");
    });
    const collection = { utils: { awaitTxId } } as unknown as CopiesWriteCollection;

    await expect(
      createFns(collection).addCopies({
        transaction: { mutations: [{ key: "id-1", modified: makeRow("id-1") }] },
      }),
    ).resolves.toBeUndefined();
  });
});

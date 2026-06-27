import { NonRetriableError } from "@tanstack/offline-transactions";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { stubDeckCardShapeRow } from "@/test/factories";

import { buildApplyBatches, createDeckOfflineMutationFns } from "./decks-offline";
import type { DeckCardMutationLike, DeckCardsWriteCollection } from "./decks-offline";
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

// The mutation function only touches utils.awaitTxId on the collection.
function fakeCollection() {
  const awaitTxId = vi.fn(async (_txid: number) => true);
  return {
    awaitTxId,
    deckCards: { utils: { awaitTxId } } as unknown as DeckCardsWriteCollection,
  };
}

function mutation(
  type: DeckCardMutationLike["type"],
  row: ReturnType<typeof stubDeckCardShapeRow>,
): DeckCardMutationLike {
  return { type, key: row.id, modified: row };
}

describe("applyDeckCards", () => {
  it("POSTs upserts and deletes for the deck and awaits the txid", async () => {
    mockApi(() => ({ status: 200, json: { txid: 42 } }));
    const { deckCards, awaitTxId } = fakeCollection();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const inserted = stubDeckCardShapeRow({
      id: "row-1",
      deck_id: "deck-1",
      card_id: "card-1",
      zone: "main",
      quantity: 2,
      preferred_printing_id: "print-1",
    });
    const updated = stubDeckCardShapeRow({
      id: "row-2",
      deck_id: "deck-1",
      card_id: "card-2",
      zone: "sideboard",
      quantity: 3,
    });
    const deleted = stubDeckCardShapeRow({ id: "row-3", deck_id: "deck-1", card_id: "card-3" });

    await createDeckOfflineMutationFns(queryClient, userA, deckCards).applyDeckCards({
      transaction: {
        mutations: [
          mutation("insert", inserted),
          mutation("update", updated),
          mutation("delete", deleted),
        ],
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("POST");
    expect(requests[0].url).toContain("/api/v1/decks/deck-1/cards/apply");
    expect(requests[0].body).toEqual({
      upserts: [
        {
          id: "row-1",
          cardId: "card-1",
          zone: "main",
          quantity: 2,
          preferredPrintingId: "print-1",
        },
        {
          id: "row-2",
          cardId: "card-2",
          zone: "sideboard",
          quantity: 3,
          preferredPrintingId: null,
        },
      ],
      deletes: ["row-3"],
    });
    expect(awaitTxId).toHaveBeenCalledWith(42);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.decks.all(userA) });
  });

  it("groups mutations by deck into separate requests", async () => {
    mockApi(() => ({ status: 200, json: { txid: 7 } }));
    const { deckCards } = fakeCollection();

    await createDeckOfflineMutationFns(queryClient, userA, deckCards).applyDeckCards({
      transaction: {
        mutations: [
          mutation("insert", stubDeckCardShapeRow({ id: "row-1", deck_id: "deck-1" })),
          mutation("insert", stubDeckCardShapeRow({ id: "row-2", deck_id: "deck-2" })),
        ],
      },
    });

    expect(requests).toHaveLength(2);
    expect(requests[0].url).toContain("/decks/deck-1/cards/apply");
    expect(requests[1].url).toContain("/decks/deck-2/cards/apply");
  });

  it("throws NonRetriableError when the deck is gone (404) so the outbox rolls back", async () => {
    mockApi(() => ({ status: 404, json: { error: "Not found" } }));
    const { deckCards } = fakeCollection();

    await expect(
      createDeckOfflineMutationFns(queryClient, userA, deckCards).applyDeckCards({
        transaction: {
          mutations: [mutation("insert", stubDeckCardShapeRow({ deck_id: "deck-gone" }))],
        },
      }),
    ).rejects.toBeInstanceOf(NonRetriableError);
  });

  it("rethrows network failures as retriable errors", async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new TypeError("fetch failed"))) as typeof fetch;
    const { deckCards } = fakeCollection();

    const attempt = createDeckOfflineMutationFns(queryClient, userA, deckCards).applyDeckCards({
      transaction: {
        mutations: [mutation("insert", stubDeckCardShapeRow({ deck_id: "deck-1" }))],
      },
    });

    await expect(attempt).rejects.toThrow();
    await expect(attempt).rejects.not.toBeInstanceOf(NonRetriableError);
  });

  it("swallows awaitTxId failures — the stream converges on its own", async () => {
    mockApi(() => ({ status: 200, json: { txid: 42 } }));
    const awaitTxId = vi.fn(() => Promise.reject(new Error("stream lag")));
    const deckCards = { utils: { awaitTxId } } as unknown as DeckCardsWriteCollection;

    await expect(
      createDeckOfflineMutationFns(queryClient, userA, deckCards).applyDeckCards({
        transaction: {
          mutations: [mutation("insert", stubDeckCardShapeRow({ deck_id: "deck-1" }))],
        },
      }),
    ).resolves.toBeUndefined();
  });

  it("does nothing for an empty transaction", async () => {
    mockApi(() => ({ status: 200, json: { txid: 1 } }));
    const { deckCards } = fakeCollection();

    await createDeckOfflineMutationFns(queryClient, userA, deckCards).applyDeckCards({
      transaction: { mutations: [] },
    });

    expect(requests).toHaveLength(0);
  });
});

describe("buildApplyBatches", () => {
  it("returns no batches when there is nothing to send", () => {
    expect(buildApplyBatches([], [])).toEqual([]);
  });

  it("keeps small payloads in a single combined batch", () => {
    const upserts = [stubDeckCardShapeRow({ id: "row-1" })];
    const deletes = ["row-2"];
    expect(buildApplyBatches(upserts, deletes)).toEqual([{ upserts, deletes }]);
  });

  it("splits oversized payloads with all deletes dispatched before upserts", () => {
    const upserts = Array.from({ length: 501 }, (_, index) =>
      stubDeckCardShapeRow({ id: `upsert-${index}` }),
    );
    const deletes = Array.from({ length: 3 }, (_, index) => `delete-${index}`);

    const batches = buildApplyBatches(upserts, deletes);

    expect(batches).toHaveLength(3);
    expect(batches[0]).toEqual({ upserts: [], deletes });
    expect(batches[1].upserts).toHaveLength(500);
    expect(batches[1].deletes).toEqual([]);
    expect(batches[2].upserts).toHaveLength(1);
  });
});

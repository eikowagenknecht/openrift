// End-to-end client-side sync pipeline: real Electric collections fed by a
// mocked shape protocol, joined by the same view query the app builds, with
// the persistence wrapper in place. Guards the shapes → raw collections →
// joined view chain and the persisted-resume-point invalidation on schema
// bumps.
import { SingleProcessCoordinator } from "@tanstack/db-sqlite-persistence-core";
import type { PersistedCollectionPersistence } from "@tanstack/db-sqlite-persistence-core";
import { createLiveQueryCollection } from "@tanstack/react-db";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getCopiesCollection,
  getDeckCardsShapeCollection,
  getListEntriesShapeCollection,
  getListsShapeCollection,
  releaseCopiesCollection,
} from "./copies-collection";

interface MetadataEntry {
  key: string;
  value: unknown;
}

function createFakePersistence(copiesMetadata: MetadataEntry[] = []) {
  const adapter = {
    loadSubset: vi.fn().mockResolvedValue([]),
    applyCommittedTx: vi.fn().mockResolvedValue(undefined),
    ensureIndex: vi.fn().mockResolvedValue(undefined),
    loadCollectionMetadata: vi.fn(async (collectionId: string) =>
      collectionId.startsWith("copies:") ? copiesMetadata : [],
    ),
  };
  return {
    adapter,
    coordinator: new SingleProcessCoordinator(),
  } as unknown as PersistedCollectionPersistence;
}

const originalFetch = globalThis.fetch;

function shapeResponse(
  messages: unknown[],
  { handle, offset, upToDate }: { handle: string; offset: string; upToDate?: boolean },
) {
  const body = upToDate ? [...messages, { headers: { control: "up-to-date" } }] : messages;
  return Response.json(body, {
    status: 200,
    headers: {
      "electric-handle": handle,
      "electric-offset": offset,
      "electric-schema": JSON.stringify({}),
      ...(upToDate ? { "electric-up-to-date": "true" } : {}),
    },
  });
}

function mockShapeFetch() {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    const isCopies = url.pathname.includes("/shapes/copies");
    const isCollections = url.pathname.includes("/shapes/collections");
    const isLists = url.pathname.endsWith("/shapes/lists");
    const isListEntries = url.pathname.includes("/shapes/list-entries");
    const isDeckCards = url.pathname.includes("/shapes/deck-cards");
    const offset = url.searchParams.get("offset");
    const live = url.searchParams.get("live");

    if (live === "true") {
      // Park live polls forever — the tests only need the initial snapshot.
      // oxlint-disable-next-line promise/avoid-new -- a never-settling promise is the point
      return new Promise<Response>(() => {});
    }
    if (isCopies && offset === "-1") {
      return shapeResponse(
        [
          {
            key: '"public"."copies"/"c1"',
            value: { id: "c1", collection_id: "col1", printing_id: "p1" },
            headers: { relation: ["public", "copies"], operation: "insert" },
          },
          {
            key: '"public"."copies"/"c2"',
            value: { id: "c2", collection_id: "col2", printing_id: "p2" },
            headers: { relation: ["public", "copies"], operation: "insert" },
          },
        ],
        { handle: "copies-h1", offset: "0_2", upToDate: true },
      );
    }
    if (isCollections && offset === "-1") {
      return shapeResponse(
        [
          {
            key: '"public"."collections"/"col1"',
            value: {
              id: "col1",
              group_id: null,
              name: "Inbox",
              description: null,
              is_inbox: true,
              sort_order: 0,
            },
            headers: { relation: ["public", "collections"], operation: "insert" },
          },
          {
            key: '"public"."collections"/"col2"',
            value: {
              id: "col2",
              group_id: "grp-9",
              name: "Pool",
              description: null,
              is_inbox: false,
              sort_order: 0,
            },
            headers: { relation: ["public", "collections"], operation: "insert" },
          },
        ],
        { handle: "cols-h1", offset: "0_2", upToDate: true },
      );
    }
    if (isLists && offset === "-1") {
      return shapeResponse(
        [
          {
            key: '"public"."lists"/"lst1"',
            value: {
              id: "lst1",
              name: "Wants",
              intent: "wish",
              kind: "card",
              default_price_pref: null,
              default_price_absolute_cents: null,
              default_trade_type: null,
              currency: null,
              sort_order: 0,
            },
            headers: { relation: ["public", "lists"], operation: "insert" },
          },
        ],
        { handle: "lists-h1", offset: "0_1", upToDate: true },
      );
    }
    if (isListEntries && offset === "-1") {
      return shapeResponse(
        [
          {
            key: '"public"."list_entries"/"le1"',
            value: {
              id: "le1",
              list_id: "lst1",
              kind: "card",
              card_id: "card-1",
              printing_id: null,
              copy_id: null,
              quantity: 2,
              price_pref: null,
              price_absolute_cents: null,
              trade_type: null,
            },
            headers: { relation: ["public", "list_entries"], operation: "insert" },
          },
        ],
        { handle: "entries-h1", offset: "0_1", upToDate: true },
      );
    }
    if (isDeckCards && offset === "-1") {
      return shapeResponse(
        [
          {
            key: '"public"."deck_cards"/"dc1"',
            value: {
              id: "dc1",
              deck_id: "deck-1",
              card_id: "card-1",
              zone: "main",
              quantity: 3,
              preferred_printing_id: null,
            },
            headers: { relation: ["public", "deck_cards"], operation: "insert" },
          },
        ],
        { handle: "deck-cards-h1", offset: "0_1", upToDate: true },
      );
    }
    // Any non-initial offset: an empty up-to-date page. Crucially, the full
    // data above is only served at offset -1 — a stream that (wrongly)
    // resumes from a stale offset never sees the rows.
    return shapeResponse([], { handle: "h-any", offset: String(offset), upToDate: true });
  }) as typeof fetch;
}

async function expectJoinedRows(view: ReturnType<typeof getCopiesCollection>) {
  const liveQuery = createLiveQueryCollection({
    query: (q) => q.from({ copy: view }),
    startSync: true,
  });
  const sub = liveQuery.subscribeChanges(() => {});
  try {
    await vi.waitFor(
      () => {
        expect(liveQuery.toArray).toHaveLength(2);
      },
      { timeout: 5000 },
    );
    const rows = liveQuery.toArray.toSorted((a, b) => String(a.id).localeCompare(String(b.id)));
    expect(rows[0]).toMatchObject({
      id: "c1",
      printingId: "p1",
      collectionId: "col1",
      groupId: null,
      synced: true,
    });
    expect(rows[1]).toMatchObject({
      id: "c2",
      printingId: "p2",
      collectionId: "col2",
      groupId: "grp-9",
      synced: true,
    });
  } finally {
    sub.unsubscribe();
  }
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("copies view fed by mocked Electric shapes", () => {
  it("delivers joined CopyResponse rows to a subscriber", async () => {
    mockShapeFetch();
    const queryClient = new QueryClient();
    const view = getCopiesCollection(queryClient, "user-sync-pipeline", createFakePersistence());
    try {
      await expectJoinedRows(view);
    } finally {
      releaseCopiesCollection(queryClient);
    }
  });

  // Regression: the persisted schema-mismatch reset wipes the locally cached
  // rows but NOT the collection metadata, where Electric keeps its resume
  // point (offset + handle, keyed by shape identity = url + params). A resume
  // point recorded before a schema bump must not be reused afterwards — the
  // stream would resume past the wiped rows and the collection would stay
  // permanently empty. The fix embeds the schema version in the shape URL, so
  // the bump changes the shape identity and the stale resume point is
  // discarded in favor of a full refetch from offset -1.
  it("feeds the lists and list-entries shapes from the same mocked protocol", async () => {
    mockShapeFetch();
    const queryClient = new QueryClient();
    const persistence = createFakePersistence();
    const lists = getListsShapeCollection(queryClient, "user-lists-pipeline", persistence);
    const listEntries = getListEntriesShapeCollection(
      queryClient,
      "user-lists-pipeline",
      persistence,
    );
    const listsSub = lists.subscribeChanges(() => {});
    const entriesSub = listEntries.subscribeChanges(() => {});
    try {
      await vi.waitFor(
        () => {
          expect(lists.toArray).toHaveLength(1);
          expect(listEntries.toArray).toHaveLength(1);
        },
        { timeout: 5000 },
      );
      expect(lists.toArray[0]).toMatchObject({
        id: "lst1",
        name: "Wants",
        intent: "wish",
        kind: "card",
        sort_order: 0,
      });
      expect(listEntries.toArray[0]).toMatchObject({
        id: "le1",
        list_id: "lst1",
        kind: "card",
        card_id: "card-1",
        quantity: 2,
      });
    } finally {
      listsSub.unsubscribe();
      entriesSub.unsubscribe();
      releaseCopiesCollection(queryClient);
    }
  });

  it("feeds the deck-cards shape from the same mocked protocol", async () => {
    mockShapeFetch();
    const queryClient = new QueryClient();
    const deckCards = getDeckCardsShapeCollection(
      queryClient,
      "user-deck-cards-pipeline",
      createFakePersistence(),
    );
    const deckCardsSub = deckCards.subscribeChanges(() => {});
    try {
      await vi.waitFor(
        () => {
          expect(deckCards.toArray).toHaveLength(1);
        },
        { timeout: 5000 },
      );
      expect(deckCards.toArray[0]).toMatchObject({
        id: "dc1",
        deck_id: "deck-1",
        card_id: "card-1",
        zone: "main",
        quantity: 3,
        preferred_printing_id: null,
      });
    } finally {
      deckCardsSub.unsubscribe();
      releaseCopiesCollection(queryClient);
    }
  });

  it("discards a resume point recorded under a previous schema version", async () => {
    mockShapeFetch();
    const queryClient = new QueryClient();
    const staleResume: MetadataEntry = {
      key: "electric:resume",
      value: {
        kind: "resume",
        offset: "0_2",
        handle: "copies-h1",
        // Shape identity as @tanstack/electric-db-collection computes it
        // (getStableShapeIdentity: stable-stringified {params, url}), for the
        // pre-fix URL without the schema version. If the URL ever loses the
        // version again, this identity matches, the stream resumes at 0_2,
        // and the rows (served only at offset -1) never arrive.
        shapeId: JSON.stringify({
          params: null,
          url: `${globalThis.location.origin}/api/v1/shapes/copies`,
        }),
        updatedAt: 1,
      },
    };
    const view = getCopiesCollection(
      queryClient,
      "user-stale-resume",
      createFakePersistence([staleResume]),
    );
    try {
      await expectJoinedRows(view);
    } finally {
      releaseCopiesCollection(queryClient);
    }
  });
});

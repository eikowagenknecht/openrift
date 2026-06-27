// End-to-end client-side prices sync pipeline: a real Electric collection fed
// by a mocked shape protocol, pivoted into a `PriceLookup`. Guards the public
// latest-prices shape → raw collection → derived lookup chain (cents → major
// units, per printing+marketplace), parking live polls so the test only needs
// the initial snapshot.
import { SingleProcessCoordinator } from "@tanstack/db-sqlite-persistence-core";
import type { PersistedCollectionPersistence } from "@tanstack/db-sqlite-persistence-core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getPricesStoreForTesting, resetPricesCollectionForTesting } from "./prices-collection";

function createFakePersistence(): PersistedCollectionPersistence {
  const adapter = {
    loadSubset: vi.fn().mockResolvedValue([]),
    applyCommittedTx: vi.fn().mockResolvedValue(undefined),
    ensureIndex: vi.fn().mockResolvedValue(undefined),
    loadCollectionMetadata: vi.fn().mockResolvedValue([]),
  };
  return {
    adapter,
    coordinator: new SingleProcessCoordinator(),
  } as unknown as PersistedCollectionPersistence;
}

const originalFetch = globalThis.fetch;

function shapeResponse(
  messages: unknown[],
  { handle, offset }: { handle: string; offset: string },
) {
  const body = [...messages, { headers: { control: "up-to-date" } }];
  return Response.json(body, {
    status: 200,
    headers: {
      "electric-handle": handle,
      "electric-offset": offset,
      "electric-schema": JSON.stringify({}),
      "electric-up-to-date": "true",
    },
  });
}

function insert(table: string, key: string, value: Record<string, unknown>) {
  return {
    key: `"public"."${table}"/"${key}"`,
    value,
    headers: { relation: ["public", table], operation: "insert" },
  };
}

const PRICE_ROWS = [
  insert("latest_printing_prices", "printing-1:tcgplayer", {
    printing_id: "printing-1",
    marketplace: "tcgplayer",
    headline_cents: 1299,
  }),
  insert("latest_printing_prices", "printing-1:cardmarket", {
    printing_id: "printing-1",
    marketplace: "cardmarket",
    headline_cents: 1050,
  }),
  insert("latest_printing_prices", "printing-2:cardtrader", {
    printing_id: "printing-2",
    marketplace: "cardtrader",
    headline_cents: 800,
  }),
];

function mockShapeFetch() {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    const offset = url.searchParams.get("offset");
    const live = url.searchParams.get("live");

    if (live === "true") {
      // Park live polls forever — the test only needs the initial snapshot.
      // oxlint-disable-next-line promise/avoid-new -- a never-settling promise is the point
      return new Promise<Response>(() => {});
    }

    if (url.pathname.endsWith("/public-shapes/latest-prices") && offset === "-1") {
      return shapeResponse(PRICE_ROWS, {
        handle: "latest-prices-h1",
        offset: `0_${PRICE_ROWS.length}`,
      });
    }
    // Any non-initial offset (or unknown shape): an empty up-to-date page.
    return shapeResponse([], { handle: "h-any", offset: String(offset) });
  }) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  resetPricesCollectionForTesting();
});

describe("prices fed by a mocked Electric shape", () => {
  it("derives a PriceLookup resolving cents to major units per printing+marketplace", async () => {
    mockShapeFetch();
    const store = getPricesStoreForTesting(createFakePersistence());

    await vi.waitFor(() => expect(store.isReady()).toBe(true), { timeout: 5000 });

    const lookup = store.derive();

    // priceLookupFromMap converts integer cents to major-unit floats (cents / 100).
    expect(lookup.get("printing-1", "tcgplayer")).toBe(12.99);
    expect(lookup.get("printing-1", "cardmarket")).toBe(10.5);
    expect(lookup.get("printing-2", "cardtrader")).toBe(8);

    // has() reports the printing presence; missing marketplaces are undefined.
    expect(lookup.has("printing-1")).toBe(true);
    expect(lookup.has("printing-2")).toBe(true);
    expect(lookup.get("printing-1", "cardtrader")).toBeUndefined();
    expect(lookup.has("printing-3")).toBe(false);
    expect(lookup.get("printing-3", "tcgplayer")).toBeUndefined();
  });

  it("memoizes the derived lookup until the shape changes", async () => {
    mockShapeFetch();
    const store = getPricesStoreForTesting(createFakePersistence());

    await vi.waitFor(() => expect(store.isReady()).toBe(true), { timeout: 5000 });

    // Same version → same identity (cheap recompute skipped).
    expect(store.derive()).toBe(store.derive());
  });

  it("is not ready until the shape has synced", async () => {
    // The latest-prices shape parks (never settles) so readiness stays false.
    globalThis.fetch = vi.fn(
      // oxlint-disable-next-line promise/avoid-new -- a never-settling promise is the point
      async () => new Promise<Response>(() => {}),
    ) as typeof fetch;

    const store = getPricesStoreForTesting(createFakePersistence());
    // Give the parked fetch a chance to be issued; readiness must stay false.
    await vi.waitFor(
      () =>
        expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0),
      { timeout: 5000 },
    );
    expect(store.isReady()).toBe(false);
  });
});

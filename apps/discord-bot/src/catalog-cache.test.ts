import { describe, expect, it } from "vitest";

import { buildSnapshot, CatalogCache, representativePrinting } from "./catalog-cache.js";
import {
  makeCard,
  makeCatalogResponse,
  makePricesResponse,
  makePrinting,
} from "./test/factories.js";

describe("buildSnapshot", () => {
  it("reattaches map keys as ids on cards and printings", () => {
    const snapshot = buildSnapshot(
      makeCatalogResponse([makeCard({ id: "c1" })], [makePrinting({ id: "p1", cardId: "c1" })]),
      makePricesResponse(),
    );
    expect(snapshot.cards.map((c) => c.id)).toEqual(["c1"]);
    expect(snapshot.printingsByCardId.get("c1")?.map((p) => p.id)).toEqual(["p1"]);
  });

  it("groups printings per card sorted by canonical rank", () => {
    const snapshot = buildSnapshot(
      makeCatalogResponse(
        [makeCard({ id: "c1" })],
        [
          makePrinting({ id: "p2", cardId: "c1", canonicalRank: 2 }),
          makePrinting({ id: "p1", cardId: "c1", canonicalRank: 1 }),
        ],
      ),
      makePricesResponse(),
    );
    expect(snapshot.printingsByCardId.get("c1")?.map((p) => p.id)).toEqual(["p1", "p2"]);
  });

  it("indexes sets by id and carries prices + currencies through", () => {
    const snapshot = buildSnapshot(
      makeCatalogResponse([makeCard()], [makePrinting()]),
      makePricesResponse({ "printing-1": { tcgplayer: 452 } }),
    );
    expect(snapshot.setsById.get("set-1")?.name).toBe("Origins");
    expect(snapshot.prices["printing-1"]).toEqual({ tcgplayer: 452 });
    expect(snapshot.currencies.tcgplayer).toBe("USD");
  });

  it("handles an empty catalog", () => {
    const snapshot = buildSnapshot(makeCatalogResponse([], [], []), makePricesResponse());
    expect(snapshot.cards).toEqual([]);
    expect(snapshot.printingsByCardId.size).toBe(0);
  });
});

describe("representativePrinting", () => {
  it("picks the lowest-ranked printing with a front image", () => {
    const snapshot = buildSnapshot(
      makeCatalogResponse(
        [makeCard({ id: "c1" })],
        [
          makePrinting({ id: "p1", cardId: "c1", canonicalRank: 1, images: [] }),
          makePrinting({ id: "p2", cardId: "c1", canonicalRank: 2 }),
        ],
      ),
      makePricesResponse(),
    );
    expect(representativePrinting(snapshot, "c1")?.id).toBe("p2");
  });

  it("falls back to the first printing when none has a front image", () => {
    const snapshot = buildSnapshot(
      makeCatalogResponse(
        [makeCard({ id: "c1" })],
        [
          makePrinting({ id: "p1", cardId: "c1", canonicalRank: 1, images: [] }),
          makePrinting({
            id: "p2",
            cardId: "c1",
            canonicalRank: 2,
            images: [{ face: "back", imageId: "0197f00d00bb" }],
          }),
        ],
      ),
      makePricesResponse(),
    );
    expect(representativePrinting(snapshot, "c1")?.id).toBe("p1");
  });

  it("returns undefined for a card without printings", () => {
    const snapshot = buildSnapshot(
      makeCatalogResponse([makeCard({ id: "c1" })], []),
      makePricesResponse(),
    );
    expect(representativePrinting(snapshot, "c1")).toBeUndefined();
  });
});

describe("CatalogCache", () => {
  it("starts without a snapshot and exposes one after refresh", async () => {
    const cache = new CatalogCache({
      fetchCatalog: () => Promise.resolve(makeCatalogResponse([makeCard()], [makePrinting()])),
      fetchPrices: () => Promise.resolve(makePricesResponse()),
    });
    expect(cache.snapshot).toBeNull();
    await cache.refresh();
    expect(cache.snapshot?.cards).toHaveLength(1);
  });

  it("keeps the previous snapshot when a refresh fails", async () => {
    let calls = 0;
    const cache = new CatalogCache({
      fetchCatalog: () => {
        calls += 1;
        return calls === 1
          ? Promise.resolve(makeCatalogResponse([makeCard()], [makePrinting()]))
          : Promise.reject(new Error("api down"));
      },
      fetchPrices: () => Promise.resolve(makePricesResponse()),
    });
    await cache.refresh();
    const before = cache.snapshot;
    await expect(cache.refresh()).rejects.toThrow("api down");
    expect(cache.snapshot).toBe(before);
  });
});

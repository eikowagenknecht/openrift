import { describe, expect, it } from "vitest";

import { createMockDb } from "../test/mock-db.js";
import { priceRefreshRepo } from "./price-refresh.js";

describe("priceRefreshRepo", () => {
  it("allSets returns sets", async () => {
    const db = createMockDb([{ id: "s-1", name: "Proving Grounds" }]);
    expect(await priceRefreshRepo(db).allSets()).toHaveLength(1);
  });

  it("allCards returns cards", async () => {
    const db = createMockDb([{ id: "c-1", name: "Annie" }]);
    expect(await priceRefreshRepo(db).allCards()).toHaveLength(1);
  });

  it("allPrintingsForPriceMatch returns printings", async () => {
    const db = createMockDb([{ id: "p-1" }]);
    expect(await priceRefreshRepo(db).allPrintingsForPriceMatch()).toHaveLength(1);
  });

  it("loadIgnoredKeys returns a Set of keys", async () => {
    const db = createMockDb([{ externalId: 123, finish: "normal", language: "EN" }]);
    const result = await priceRefreshRepo(db).loadIgnoredKeys("tcgplayer");
    expect(result).toBeInstanceOf(Set);
    expect(result.has("123::normal::EN")).toBe(true);
  });

  it("upsertGroups upserts marketplace groups", async () => {
    const db = createMockDb([]);
    await expect(
      priceRefreshRepo(db).upsertGroups("tcgplayer", [{ groupId: 1, name: "Group" }]),
    ).resolves.toBeUndefined();
  });

  it("upsertGroups is no-op for empty array", async () => {
    const db = createMockDb([]);
    await expect(priceRefreshRepo(db).upsertGroups("tcgplayer", [])).resolves.toBeUndefined();
  });

  it("sourcesWithFinish returns sources with printing finish", async () => {
    const db = createMockDb([{ id: "ps-1", printingId: "p-1", externalId: 123, finish: "normal" }]);
    expect(await priceRefreshRepo(db).sourcesWithFinish("tcgplayer")).toHaveLength(1);
  });

  it("countSnapshots returns count", async () => {
    const db = createMockDb([{ count: 42 }]);
    expect(await priceRefreshRepo(db).countSnapshots("tcgplayer")).toBe(42);
  });

  it("countStaging returns count", async () => {
    const db = createMockDb([{ count: 10 }]);
    expect(await priceRefreshRepo(db).countStaging("tcgplayer")).toBe(10);
  });

  it("upsertSnapshots returns affected count", async () => {
    const db = createMockDb([{ _: 1 }]);
    expect(
      await priceRefreshRepo(db).upsertSnapshots([
        {
          productId: "ps-1",
          recordedAt: new Date(),
          marketCents: 1500,
          lowCents: null,
          midCents: null,
          highCents: null,
          trendCents: null,
          avg1Cents: null,
          avg7Cents: null,
          avg30Cents: null,
        },
      ]),
    ).toBe(1);
  });

  it("upsertStaging returns affected count", async () => {
    const db = createMockDb([{ _: 1 }]);
    expect(
      await priceRefreshRepo(db).upsertStaging("tcgplayer", [
        {
          externalId: 123,
          finish: "normal",
          language: "EN",
          productName: "Card",
          recordedAt: new Date(),
          groupId: 1,
          marketCents: 1500,
          lowCents: null,
          midCents: null,
          highCents: null,
          trendCents: null,
          avg1Cents: null,
          avg7Cents: null,
          avg30Cents: null,
        },
      ]),
    ).toBe(1);
  });

  it("existingSourcesByMarketplaces returns sources", async () => {
    const db = createMockDb([{ marketplace: "tcgplayer", externalId: 123 }]);
    expect(await priceRefreshRepo(db).existingSourcesByMarketplaces(["tcgplayer"])).toHaveLength(1);
  });

  it("existingExternalIdsByMarketplace returns IDs", async () => {
    const db = createMockDb([{ externalId: 123 }]);
    expect(await priceRefreshRepo(db).existingExternalIdsByMarketplace("tcgplayer")).toEqual([123]);
  });

  it("batchInsertProducts inserts products", async () => {
    const db = createMockDb([]);
    await expect(
      priceRefreshRepo(db).batchInsertProducts([
        {
          marketplace: "tcgplayer",
          externalId: 123,
          groupId: 1,
          productName: "Card",
          printingId: "p-1",
          language: "EN",
        },
      ]),
    ).resolves.toBeUndefined();
  });

  it("batchInsertProducts is no-op for empty array", async () => {
    const db = createMockDb([]);
    await expect(priceRefreshRepo(db).batchInsertProducts([])).resolves.toBeUndefined();
  });
});

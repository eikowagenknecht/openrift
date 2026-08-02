import { describe, expect, it } from "vitest";

import { createMockDb } from "../test/mock-db.js";
import { cardErrataRepo } from "./card-errata.js";

const ERRATA = {
  correctedRulesText: "Deal 3 damage.",
  correctedEffectText: null,
  source: "riot-patch-notes",
  sourceUrl: null,
  effectiveDate: new Date("2026-01-01"),
};

describe("cardErrataRepo", () => {
  it("upsert writes the errata row", async () => {
    const db = createMockDb([]);
    await expect(
      cardErrataRepo(db).upsert("c-1", {
        correctedRulesText: "Deal 3 damage.",
        correctedEffectText: null,
        source: "riot-patch-notes",
        sourceUrl: null,
        effectiveDate: "2026-01-01",
      }),
    ).resolves.toBeUndefined();
  });

  it("upsert accepts a null effective date", async () => {
    const db = createMockDb([]);
    await expect(
      cardErrataRepo(db).upsert("c-1", {
        correctedRulesText: null,
        correctedEffectText: "Draw a card.",
        source: "manual",
        sourceUrl: "https://example.invalid/patch",
        effectiveDate: null,
      }),
    ).resolves.toBeUndefined();
  });

  it("deleteByCardId removes the errata row", async () => {
    const db = createMockDb([]);
    await expect(cardErrataRepo(db).deleteByCardId("c-1")).resolves.toBeUndefined();
  });

  it("getByCardId returns the errata row", async () => {
    const db = createMockDb([ERRATA]);
    expect(await cardErrataRepo(db).getByCardId("c-1")).toEqual(ERRATA);
  });

  it("getByCardId returns null when the card has no errata", async () => {
    const db = createMockDb([]);
    expect(await cardErrataRepo(db).getByCardId("c-1")).toBeNull();
  });

  it("getByCardIds returns the matching rows", async () => {
    const rows = [{ cardId: "c-1", ...ERRATA }];
    const db = createMockDb(rows);
    expect(await cardErrataRepo(db).getByCardIds(["c-1"])).toEqual(rows);
  });

  it("getByCardIds short-circuits on an empty id list", async () => {
    // Guard the early return: no ids must not reach the database at all.
    const throwingDb = new Proxy(
      {},
      {
        get() {
          throw new Error("db must not be touched for an empty id list");
        },
      },
    ) as never;
    expect(await cardErrataRepo(throwingDb).getByCardIds([])).toEqual([]);
  });
});

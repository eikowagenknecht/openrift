import { describe, expect, it } from "vitest";

import { gravatarHashForEmail } from "../lib/gravatar.js";
import { createMockDb } from "../test/mock-db.js";
import { friendGroupMatchesRepo } from "./friend-group-matches.js";

const DB_ROW = {
  counterpartyUserId: "u-seller",
  counterpartyName: "Alice",
  counterpartyImage: null,
  counterpartyEmail: "alice@example.com",
  counterpartyListId: "lst-sell",
  counterpartyListName: "Spare Foils",
  sellEntryId: "le-1",
  sellListId: "lst-1",
  copyId: "cpy-1",
  printingId: "prt-1",
  cardId: "crd-1",
  cardName: "Annie, Fiery",
  cardType: "unit" as const,
  setId: "set-1",
  rarity: "common" as const,
  finish: "regular" as const,
  imageId: null,
  buyEntryId: "le-2",
  buyListId: "lst-2",
  buyEntryKind: "card" as const,
  buyQuantity: 1,
  sellPricePref: null,
  sellPriceAbsoluteCents: null,
  sellTradeType: null,
  sellCurrency: null,
  buyPricePref: null,
  buyPriceAbsoluteCents: null,
  buyTradeType: null,
  buyCurrency: null,
};

const EMPTY_EFFECTIVE = {
  pricePref: null,
  priceAbsoluteCents: null,
  tradeType: null,
  currency: null,
};

function expectedRow(overrides: Partial<typeof DB_ROW> = {}): unknown {
  const merged = { ...DB_ROW, ...overrides };
  const {
    counterpartyEmail,
    sellPricePref,
    sellPriceAbsoluteCents,
    sellTradeType,
    sellCurrency,
    buyPricePref,
    buyPriceAbsoluteCents,
    buyTradeType,
    buyCurrency,
    ...rest
  } = merged;
  return {
    ...rest,
    counterpartyGravatarHash: gravatarHashForEmail(counterpartyEmail),
    sellPref: {
      pricePref: sellPricePref,
      priceAbsoluteCents: sellPricePref === "absolute" ? sellPriceAbsoluteCents : null,
      tradeType: sellTradeType,
      currency: sellCurrency,
    },
    buyPref: {
      pricePref: buyPricePref,
      priceAbsoluteCents: buyPricePref === "absolute" ? buyPriceAbsoluteCents : null,
      tradeType: buyTradeType,
      currency: buyCurrency,
    },
  };
}

describe("friendGroupMatchesRepo", () => {
  it("othersHaveYourWants returns rows in the expected shape", async () => {
    const repo = friendGroupMatchesRepo(createMockDb([DB_ROW]));
    const rows = await repo.othersHaveYourWants({ groupId: "grp-1", viewerUserId: "u-buyer" });
    expect(rows).toEqual([expectedRow()]);
  });

  it("othersWantYourHaves returns rows in the expected shape", async () => {
    const repo = friendGroupMatchesRepo(createMockDb([DB_ROW]));
    const rows = await repo.othersWantYourHaves({ groupId: "grp-1", viewerUserId: "u-seller" });
    expect(rows).toEqual([expectedRow()]);
  });

  it("sorts by counterparty name then card name", async () => {
    const a = { ...DB_ROW, counterpartyName: "Alice", cardName: "Beta" };
    const aa = { ...DB_ROW, counterpartyName: "Alice", cardName: "Alpha" };
    const b = { ...DB_ROW, counterpartyName: "Bob", cardName: "Alpha" };
    const repo = friendGroupMatchesRepo(createMockDb([b, a, aa]));
    const rows = await repo.othersHaveYourWants({ groupId: "grp-1", viewerUserId: "u" });
    expect(rows.map((r) => `${r.counterpartyName ?? ""}::${r.cardName}`)).toEqual([
      "Alice::Alpha",
      "Alice::Beta",
      "Bob::Alpha",
    ]);
  });

  it("scopes the query when counterpartyUserId is given", async () => {
    const repo = friendGroupMatchesRepo(createMockDb([DB_ROW]));
    const rows = await repo.othersHaveYourWants({
      groupId: "grp-1",
      viewerUserId: "u-buyer",
      counterpartyUserId: "u-seller",
    });
    expect(rows).toEqual([expectedRow()]);
  });

  it("returns NULL preferences as empty EffectiveTradePreference on both sides", async () => {
    const repo = friendGroupMatchesRepo(createMockDb([DB_ROW]));
    const [row] = await repo.othersHaveYourWants({ groupId: "grp-1", viewerUserId: "u-buyer" });
    expect(row?.sellPref).toEqual(EMPTY_EFFECTIVE);
    expect(row?.buyPref).toEqual(EMPTY_EFFECTIVE);
  });

  it("ships resolved sellPref / buyPref through to the match row", async () => {
    const row = {
      ...DB_ROW,
      sellPricePref: "cm_lowest" as const,
      sellTradeType: "cards" as const,
      sellCurrency: "EUR" as const,
      buyPricePref: "absolute" as const,
      buyPriceAbsoluteCents: 400,
      buyTradeType: "money" as const,
      buyCurrency: "USD" as const,
    };
    const repo = friendGroupMatchesRepo(createMockDb([row]));
    const [resolved] = await repo.othersHaveYourWants({ groupId: "grp-1", viewerUserId: "u" });
    expect(resolved?.sellPref).toEqual({
      pricePref: "cm_lowest",
      priceAbsoluteCents: null,
      tradeType: "cards",
      currency: "EUR",
    });
    expect(resolved?.buyPref).toEqual({
      pricePref: "absolute",
      priceAbsoluteCents: 400,
      tradeType: "money",
      currency: "USD",
    });
  });

  it("clears priceAbsoluteCents when the resolved pricePref is not 'absolute'", async () => {
    // Defensive: SELECT-time COALESCE could pull an absolute amount from the
    // list default while the entry override switched the pref to a marketplace
    // preset. The mapper must normalise the shape so consumers don't see a
    // bogus number attached to a non-absolute pref.
    const row = {
      ...DB_ROW,
      sellPricePref: "cm_lowest" as const,
      sellPriceAbsoluteCents: 250,
    };
    const repo = friendGroupMatchesRepo(createMockDb([row]));
    const [resolved] = await repo.othersHaveYourWants({ groupId: "grp-1", viewerUserId: "u" });
    expect(resolved?.sellPref.priceAbsoluteCents).toBeNull();
  });
});

describe("recentIncomingMatchesForFeed", () => {
  const FEED_ROW = {
    counterpartyUserId: "u-seller",
    counterpartyName: "Alice",
    counterpartyImage: null,
    counterpartyEmail: "alice@example.com",
    printingId: "prt-1",
    cardId: "crd-1",
    matchedAt: new Date("2026-06-01T00:00:00.000Z"),
  };

  it("maps a row to the feed shape with a derived gravatar hash", async () => {
    const repo = friendGroupMatchesRepo(createMockDb([FEED_ROW]));
    const rows = await repo.recentIncomingMatchesForFeed({
      groupId: "grp-1",
      viewerUserId: "u-buyer",
      limit: 10,
    });
    expect(rows).toEqual([
      {
        counterpartyUserId: "u-seller",
        counterpartyName: "Alice",
        counterpartyImage: null,
        counterpartyGravatarHash: gravatarHashForEmail("alice@example.com"),
        printingId: "prt-1",
        cardId: "crd-1",
        matchedAt: new Date("2026-06-01T00:00:00.000Z"),
      },
    ]);
  });

  it("dedupes by (counterparty, printing), keeping the latest matchedAt", async () => {
    const older = { ...FEED_ROW, matchedAt: new Date("2026-05-01T00:00:00.000Z") };
    const newer = { ...FEED_ROW, matchedAt: new Date("2026-06-02T00:00:00.000Z") };
    const repo = friendGroupMatchesRepo(createMockDb([older, newer]));
    const rows = await repo.recentIncomingMatchesForFeed({
      groupId: "g",
      viewerUserId: "v",
      limit: 10,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.matchedAt).toEqual(new Date("2026-06-02T00:00:00.000Z"));
  });

  it("keeps distinct (counterparty, printing) pairs separate, newest first", async () => {
    const a = { ...FEED_ROW, printingId: "prt-a", matchedAt: new Date("2026-06-01T00:00:00.000Z") };
    const b = {
      ...FEED_ROW,
      counterpartyUserId: "u-other",
      counterpartyEmail: "bob@example.com",
      printingId: "prt-b",
      matchedAt: new Date("2026-06-05T00:00:00.000Z"),
    };
    const repo = friendGroupMatchesRepo(createMockDb([a, b]));
    const rows = await repo.recentIncomingMatchesForFeed({
      groupId: "g",
      viewerUserId: "v",
      limit: 10,
    });
    expect(rows.map((row) => row.printingId)).toEqual(["prt-b", "prt-a"]);
  });

  it("respects the limit after sorting newest first", async () => {
    const rowsIn = [
      { ...FEED_ROW, printingId: "p1", matchedAt: new Date("2026-06-01T00:00:00.000Z") },
      { ...FEED_ROW, printingId: "p2", matchedAt: new Date("2026-06-02T00:00:00.000Z") },
      { ...FEED_ROW, printingId: "p3", matchedAt: new Date("2026-06-03T00:00:00.000Z") },
    ];
    const repo = friendGroupMatchesRepo(createMockDb(rowsIn));
    const rows = await repo.recentIncomingMatchesForFeed({
      groupId: "g",
      viewerUserId: "v",
      limit: 2,
    });
    expect(rows.map((row) => row.printingId)).toEqual(["p3", "p2"]);
  });
});

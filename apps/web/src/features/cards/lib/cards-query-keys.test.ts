import { describe, expect, it } from "vitest";

import { catalogKeys, ownedCountKeys, priceHistoryKeys } from "./cards-query-keys";

describe("catalogKeys", () => {
  it("all", () => {
    expect(catalogKeys.all).toEqual(["catalog"]);
  });
});

describe("ownedCountKeys", () => {
  it("all", () => {
    expect(ownedCountKeys.all).toEqual(["ownedCount"]);
  });
});

describe("priceHistoryKeys", () => {
  it("byPrinting returns tuple with printingId and range", () => {
    expect(priceHistoryKeys.byPrinting("p1", "30d")).toEqual(["priceHistory", "p1", "30d"]);
  });
});

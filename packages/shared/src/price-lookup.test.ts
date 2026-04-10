import { describe, expect, it } from "bun:test";

import { EMPTY_PRICE_LOOKUP, priceLookupFromMap } from "./price-lookup.js";
import type { PriceMap } from "./types/api/pricing.js";

describe("priceLookupFromMap", () => {
  const map: PriceMap = {
    "p-1": { tcgplayer: 4.5, cardmarket: 3.8 },
    "p-2": { cardmarket: 1.2 },
  };
  const lookup = priceLookupFromMap(map);

  it("returns the price for a known printing and marketplace", () => {
    expect(lookup.get("p-1", "tcgplayer")).toBe(4.5);
    expect(lookup.get("p-1", "cardmarket")).toBe(3.8);
    expect(lookup.get("p-2", "cardmarket")).toBe(1.2);
  });

  it("returns undefined when the marketplace is missing for the printing", () => {
    expect(lookup.get("p-2", "tcgplayer")).toBeUndefined();
    expect(lookup.get("p-1", "cardtrader")).toBeUndefined();
  });

  it("returns undefined for an unknown printing", () => {
    expect(lookup.get("missing", "tcgplayer")).toBeUndefined();
  });

  it("has() reflects whether the printing has any price entries", () => {
    expect(lookup.has("p-1")).toBe(true);
    expect(lookup.has("p-2")).toBe(true);
    expect(lookup.has("missing")).toBe(false);
  });
});

describe("EMPTY_PRICE_LOOKUP", () => {
  it("get() always returns undefined", () => {
    expect(EMPTY_PRICE_LOOKUP.get("anything", "tcgplayer")).toBeUndefined();
  });

  it("has() always returns false", () => {
    expect(EMPTY_PRICE_LOOKUP.has("anything")).toBe(false);
  });
});

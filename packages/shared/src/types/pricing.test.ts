import { describe, expect, it } from "vitest";

import { ALL_MARKETPLACES, marketplaceCarriesLanguage } from "./pricing";

describe("marketplaceCarriesLanguage", () => {
  it("carries English on every marketplace", () => {
    for (const marketplace of ALL_MARKETPLACES) {
      expect(marketplaceCarriesLanguage(marketplace, "EN")).toBe(true);
    }
  });

  it("does not carry Simplified Chinese on TCGplayer", () => {
    expect(marketplaceCarriesLanguage("tcgplayer", "SC")).toBe(false);
  });

  it("rejects every non-English language on TCGplayer", () => {
    for (const language of ["SC", "FR", "KR"]) {
      expect(marketplaceCarriesLanguage("tcgplayer", language)).toBe(false);
    }
  });

  it("leaves Cardmarket and CardTrader unrestricted", () => {
    for (const marketplace of ["cardmarket", "cardtrader"] as const) {
      for (const language of ["SC", "FR", "KR"]) {
        expect(marketplaceCarriesLanguage(marketplace, language)).toBe(true);
      }
    }
  });

  it("treats an unknown language as uncarried on a restricted marketplace", () => {
    expect(marketplaceCarriesLanguage("tcgplayer", "")).toBe(false);
    expect(marketplaceCarriesLanguage("tcgplayer", "en")).toBe(false);
  });
});

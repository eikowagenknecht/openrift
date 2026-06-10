import { ALL_MARKETPLACES } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import { MARKETPLACE_SHORT_LABELS, marketplaceLabel } from "./marketplace-meta";

describe("MARKETPLACE_SHORT_LABELS", () => {
  it("has a compact label for every marketplace", () => {
    for (const marketplace of ALL_MARKETPLACES) {
      expect(MARKETPLACE_SHORT_LABELS[marketplace]).toBeTruthy();
    }
  });

  it("uses the expected abbreviations", () => {
    expect(MARKETPLACE_SHORT_LABELS.tcgplayer).toBe("TCG");
    expect(MARKETPLACE_SHORT_LABELS.cardmarket).toBe("CM");
    expect(MARKETPLACE_SHORT_LABELS.cardtrader).toBe("CT");
  });
});

describe("marketplaceLabel", () => {
  it("returns the full display label for known marketplaces", () => {
    expect(marketplaceLabel("tcgplayer")).toBe("TCGplayer");
    expect(marketplaceLabel("cardtrader")).toBe("CardTrader");
  });

  it("falls back to the raw value for unknown marketplaces", () => {
    expect(marketplaceLabel("mystery")).toBe("mystery");
  });
});

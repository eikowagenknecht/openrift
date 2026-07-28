import { describe, expect, it } from "vitest";

import {
  affiliateUrl,
  cardmarketLangParam,
  cardtraderAffiliateUrl,
  MARKETPLACE_LINKS,
  MARKETPLACE_SHORT_LABELS,
  marketplaceLabel,
} from "./marketplace.js";
import { ALL_MARKETPLACES } from "./types/index.js";

describe("affiliateUrl", () => {
  it("wraps the target URL in the TCGplayer partner redirect", () => {
    expect(affiliateUrl("https://www.tcgplayer.com/product/123")).toBe(
      "https://partner.tcgplayer.com/openrift?u=https%3A%2F%2Fwww.tcgplayer.com%2Fproduct%2F123",
    );
  });

  it("encodes special characters in the wrapped URL", () => {
    expect(affiliateUrl("https://example.com/search?q=fire&page=1")).toContain(
      "u=https%3A%2F%2Fexample.com%2Fsearch%3Fq%3Dfire%26page%3D1",
    );
  });
});

describe("cardtraderAffiliateUrl", () => {
  it("appends the share code with ? when the URL has no query", () => {
    expect(cardtraderAffiliateUrl("https://www.cardtrader.com/en/cards/9")).toBe(
      "https://www.cardtrader.com/en/cards/9?share_code=openrift",
    );
  });

  it("appends the share code with & when the URL already has a query", () => {
    expect(cardtraderAffiliateUrl("https://www.cardtrader.com/en/search?q=viktor")).toBe(
      "https://www.cardtrader.com/en/search?q=viktor&share_code=openrift",
    );
  });
});

describe("cardmarketLangParam", () => {
  it("returns empty string for null/undefined language", () => {
    expect(cardmarketLangParam(null)).toBe("");
    expect(cardmarketLangParam(undefined)).toBe("");
    expect(cardmarketLangParam("")).toBe("");
  });

  it("maps EN to language code 1", () => {
    expect(cardmarketLangParam("EN")).toBe("&language=1");
  });

  it("maps SC (our stored code) to simplified Chinese (6)", () => {
    expect(cardmarketLangParam("SC")).toBe("&language=6");
  });

  it("still maps the retired ZH code, for links shared before the SC rename", () => {
    expect(cardmarketLangParam("ZH")).toBe("&language=6");
  });

  it("also maps the explicit ZH-CN form to simplified Chinese (6)", () => {
    expect(cardmarketLangParam("ZH-CN")).toBe("&language=6");
  });

  it("maps ZH-TW to traditional Chinese (11)", () => {
    expect(cardmarketLangParam("ZH-TW")).toBe("&language=11");
  });

  it("is case-insensitive", () => {
    expect(cardmarketLangParam("en")).toBe("&language=1");
    expect(cardmarketLangParam("sc")).toBe("&language=6");
  });

  it("returns empty string for unknown languages rather than passing through", () => {
    expect(cardmarketLangParam("XX")).toBe("");
    expect(cardmarketLangParam("klingon")).toBe("");
  });
});

describe("MARKETPLACE_LINKS", () => {
  it("builds affiliate product links for TCGplayer and CardTrader", () => {
    expect(MARKETPLACE_LINKS.tcgplayer.productUrl(42)).toContain("partner.tcgplayer.com/openrift");
    expect(MARKETPLACE_LINKS.cardtrader.productUrl(42)).toContain("share_code=openrift");
  });

  it("builds Cardmarket product links with an optional language filter", () => {
    expect(MARKETPLACE_LINKS.cardmarket.productUrl(42)).toBe(
      "https://www.cardmarket.com/en/Riftbound/Products?idProduct=42",
    );
    expect(MARKETPLACE_LINKS.cardmarket.productUrl(42, "DE")).toBe(
      "https://www.cardmarket.com/en/Riftbound/Products?idProduct=42&language=3",
    );
  });

  it("URL-encodes search queries", () => {
    expect(MARKETPLACE_LINKS.cardmarket.searchUrl("Viktor, Herald")).toContain(
      "searchString=Viktor%2C%20Herald",
    );
  });
});

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

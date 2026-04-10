import { describe, expect, it } from "vitest";

import { cardmarketLangParam } from "./marketplace-language";

describe("cardmarketLangParam", () => {
  it("returns empty string for null/undefined language", () => {
    expect(cardmarketLangParam(null)).toBe("");
    expect(cardmarketLangParam(undefined)).toBe("");
    expect(cardmarketLangParam("")).toBe("");
  });

  it("maps EN to language code 1", () => {
    expect(cardmarketLangParam("EN")).toBe("&language=1");
  });

  it("maps ZH (our stored code) to simplified Chinese (6)", () => {
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
    expect(cardmarketLangParam("zh")).toBe("&language=6");
  });

  it("returns empty string for unknown languages rather than passing through", () => {
    expect(cardmarketLangParam("XX")).toBe("");
    expect(cardmarketLangParam("klingon")).toBe("");
  });
});

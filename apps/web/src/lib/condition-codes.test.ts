import { describe, expect, it } from "vitest";

import { conditionSlugFromSource, piltoverConditionCode } from "./condition-codes";

describe("conditionSlugFromSource", () => {
  it("passes house slugs through for round-trips", () => {
    expect(conditionSlugFromSource("near-mint")).toBe("near-mint");
    expect(conditionSlugFromSource("light-played")).toBe("light-played");
  });

  it("maps Cardmarket-style codes", () => {
    expect(conditionSlugFromSource("MT")).toBe("mint");
    expect(conditionSlugFromSource("NM")).toBe("near-mint");
    expect(conditionSlugFromSource("EX")).toBe("excellent");
    expect(conditionSlugFromSource("GD")).toBe("good");
    expect(conditionSlugFromSource("PL")).toBe("played");
    expect(conditionSlugFromSource("PO")).toBe("poor");
  });

  it("maps TCGplayer-style tiers onto the house scale", () => {
    expect(conditionSlugFromSource("LP")).toBe("light-played");
    expect(conditionSlugFromSource("MP")).toBe("played");
    expect(conditionSlugFromSource("HP")).toBe("poor");
    expect(conditionSlugFromSource("DMG")).toBe("poor");
  });

  it("is case-insensitive and trims", () => {
    expect(conditionSlugFromSource(" nm ")).toBe("near-mint");
    expect(conditionSlugFromSource("Near Mint")).toBe("near-mint");
  });

  it("returns undefined for blank or unrecognized values", () => {
    expect(conditionSlugFromSource(undefined)).toBeUndefined();
    expect(conditionSlugFromSource("")).toBeUndefined();
    expect(conditionSlugFromSource("SEAL")).toBeUndefined();
  });
});

describe("piltoverConditionCode", () => {
  it("maps every house slug", () => {
    expect(piltoverConditionCode("mint")).toBe("M");
    expect(piltoverConditionCode("near-mint")).toBe("NM");
    expect(piltoverConditionCode("excellent")).toBe("EX");
    expect(piltoverConditionCode("good")).toBe("GD");
    expect(piltoverConditionCode("light-played")).toBe("LP");
    expect(piltoverConditionCode("played")).toBe("PL");
    expect(piltoverConditionCode("poor")).toBe("PO");
  });

  it("falls back to NM for unrecorded copies", () => {
    expect(piltoverConditionCode(null)).toBe("NM");
  });
});

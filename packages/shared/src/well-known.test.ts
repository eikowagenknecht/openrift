import { describe, expect, it } from "vitest";

import { isBaseBanFormat, WellKnown } from "./well-known.js";

describe("isBaseBanFormat", () => {
  it("treats the base constructed list as the base ban format", () => {
    expect(isBaseBanFormat(WellKnown.banFormat.CONSTRUCTED)).toBe(true);
    expect(isBaseBanFormat("standard")).toBe(true);
  });

  it("treats mode-scoped formats as non-base", () => {
    expect(isBaseBanFormat("2v2")).toBe(false);
    expect(isBaseBanFormat("1v1")).toBe(false);
    expect(isBaseBanFormat("ffa")).toBe(false);
    expect(isBaseBanFormat("freeform")).toBe(false);
  });

  it("does not match on empty or near-miss ids", () => {
    expect(isBaseBanFormat("")).toBe(false);
    expect(isBaseBanFormat("Standard")).toBe(false);
    expect(isBaseBanFormat(" standard")).toBe(false);
  });
});

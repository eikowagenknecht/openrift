import { describe, expect, it } from "vitest";

import { candidateCardFieldRules } from "./schemas.js";

// The noEmptyJsonb schema is used by candidateCardFieldRules.extraData
const noEmptyJsonb = candidateCardFieldRules.extraData;

describe("noEmptyJsonb", () => {
  it("passes for null", () => {
    expect(noEmptyJsonb.safeParse(null).success).toBe(true);
  });

  it("passes for undefined", () => {
    expect(noEmptyJsonb.safeParse().success).toBe(true);
  });

  it("fails for empty object", () => {
    expect(noEmptyJsonb.safeParse({}).success).toBe(false);
  });

  it("passes for non-empty object", () => {
    expect(noEmptyJsonb.safeParse({ key: "value" }).success).toBe(true);
  });

  it("fails for array", () => {
    expect(noEmptyJsonb.safeParse([1, 2]).success).toBe(false);
  });
});

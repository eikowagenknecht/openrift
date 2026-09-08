import { describe, expect, it } from "vitest";

import { normalizeFormatKey } from "./meta-providers.js";

describe("normalizeFormatKey", () => {
  it("folds case and punctuation, so one stored row covers the variants", () => {
    expect(normalizeFormatKey("Standard Constructed")).toBe("standardconstructed");
    expect(normalizeFormatKey("riftbound-constructed")).toBe("riftboundconstructed");
  });
});

import { describe, expect, it } from "vitest";

import { formatFinishTier } from "./meta-format";

describe("formatFinishTier", () => {
  it("renders podium tiers as ordinals", () => {
    expect(formatFinishTier(1)).toBe("1st");
    expect(formatFinishTier(2)).toBe("2nd");
    expect(formatFinishTier(3)).toBe("3rd");
  });

  it("renders top-cut tiers as T-buckets", () => {
    expect(formatFinishTier(4)).toBe("T4");
    expect(formatFinishTier(8)).toBe("T8");
    expect(formatFinishTier(16)).toBe("T16");
    expect(formatFinishTier(1024)).toBe("T1024");
  });
});

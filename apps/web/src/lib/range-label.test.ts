import { NONE } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import { rangeBadgeLabel } from "./range-label";

describe("rangeBadgeLabel", () => {
  it("shows a single value when min equals max", () => {
    expect(rangeBadgeLabel(3, 3, 0, 10)).toBe("3");
  });

  it("shows a closed range when both bounds are set", () => {
    expect(rangeBadgeLabel(2, 4, 0, 10)).toBe("2–4");
  });

  it("shows an upper-bounded range when min is open", () => {
    expect(rangeBadgeLabel(null, 4, 1, 10)).toBe("≤4");
  });

  it("shows a lower-bounded range when max is open", () => {
    expect(rangeBadgeLabel(2, null, 1, 10)).toBe("≥2");
  });

  it("labels the all-NONE selection as None", () => {
    expect(rangeBadgeLabel(NONE, NONE, NONE, 10)).toBe("None");
  });

  it("labels a NONE lower bound with a real upper bound", () => {
    expect(rangeBadgeLabel(NONE, 4, NONE, 10)).toBe("None–4");
  });

  it("applies the formatter to both bounds", () => {
    expect(rangeBadgeLabel(2, 4, 0, 10, (value) => `$${value}`)).toBe("$2–$4");
  });
});

import { describe, expect, it } from "vitest";

import { compareRuleNumbers } from "./rules.js";

describe("compareRuleNumbers", () => {
  it("sorts plain integers numerically, not lexicographically", () => {
    const input = ["1000", "100", "200", "30"];
    expect(input.toSorted(compareRuleNumbers)).toEqual(["30", "100", "200", "1000"]);
  });

  it("sorts mixed-version cross-section in natural rule order (regression for 300 before 184.5)", () => {
    const input = ["300", "184.5", "184.6", "187.1", "185"];
    expect(input.toSorted(compareRuleNumbers)).toEqual(["184.5", "184.6", "185", "187.1", "300"]);
  });

  it("orders deeper segments after their parent", () => {
    const input = ["100.1.a", "100", "100.1", "200"];
    expect(input.toSorted(compareRuleNumbers)).toEqual(["100", "100.1", "100.1.a", "200"]);
  });

  it("places numeric segments before letter segments at the same depth", () => {
    const input = ["100.a", "100.1", "100.b", "100.2"];
    expect(input.toSorted(compareRuleNumbers)).toEqual(["100.1", "100.2", "100.a", "100.b"]);
  });

  it("returns 0 for identical inputs", () => {
    expect(compareRuleNumbers("184.5.a", "184.5.a")).toBe(0);
  });
});

import { describe, expect, it } from "vitest";

import { ruleKindTitle, VALID_RULE_KINDS } from "./rules-kinds";

describe("rules-kinds", () => {
  it("titles each rule kind", () => {
    expect(ruleKindTitle("tournament")).toBe("Tournament Rules");
    expect(ruleKindTitle("core")).toBe("Core Rules");
  });

  it("recognizes the valid rule kinds", () => {
    expect(VALID_RULE_KINDS.has("core")).toBe(true);
    expect(VALID_RULE_KINDS.has("tournament")).toBe(true);
  });
});

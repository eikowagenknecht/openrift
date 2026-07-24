import { describe, expect, it } from "vitest";

import { ruleCountLabel } from "./rule-editor-dialog";

describe("ruleCountLabel", () => {
  it("labels a plain wish rule's count as matches", () => {
    expect(ruleCountLabel(191, "card", { isTrade: false, netOwned: false })).toBe(
      "matches 191 cards",
    );
  });

  it("labels a netting wish rule's count as missing (post-netting shortfall)", () => {
    expect(ruleCountLabel(188, "card", { isTrade: false, netOwned: true })).toBe(
      "missing 188 cards",
    );
  });

  it("labels a trade rule's count as offers, regardless of netOwned", () => {
    expect(ruleCountLabel(3, "copy", { isTrade: true, netOwned: false })).toBe("offers 3 copies");
    expect(ruleCountLabel(3, "copy", { isTrade: true, netOwned: true })).toBe("offers 3 copies");
  });

  it("pluralizes per kind and singular counts", () => {
    expect(ruleCountLabel(1, "card", { isTrade: false, netOwned: true })).toBe("missing 1 card");
    expect(ruleCountLabel(2, "printing", { isTrade: false, netOwned: false })).toBe(
      "matches 2 printings",
    );
    expect(ruleCountLabel(1, "copy", { isTrade: true, netOwned: false })).toBe("offers 1 copy");
  });
});

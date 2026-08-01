import type { ListIntent, ListKind } from "@openrift/shared";
import { defaultRuleCombine, ruleCombineMatchesKind } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import { matchLabel, ruleCountLabel, ruleWording } from "./rule-wording";

const COMBOS: [ListIntent, ListKind][] = [
  ["wish", "card"],
  ["wish", "printing"],
  ["trade", "copy"],
  ["organize", "card"],
  ["organize", "printing"],
  ["organize", "copy"],
];

describe("matchLabel", () => {
  it("pluralizes each list kind", () => {
    expect(matchLabel(191, "card")).toBe("191 cards");
    expect(matchLabel(1, "card")).toBe("1 card");
    expect(matchLabel(2, "printing")).toBe("2 printings");
    expect(matchLabel(1, "printing")).toBe("1 printing");
    expect(matchLabel(3, "copy")).toBe("3 copies");
    expect(matchLabel(1, "copy")).toBe("1 copy");
    expect(matchLabel(0, "card")).toBe("0 cards");
  });
});

describe("ruleCountLabel", () => {
  it("says what a wish rule matches", () => {
    expect(ruleCountLabel(191, "card", ruleWording("wish", "card"), false)).toBe(
      "matches 191 cards",
    );
  });

  it("switches to a shortfall verb once the rule nets owned copies", () => {
    expect(ruleCountLabel(188, "card", ruleWording("wish", "card"), true)).toBe(
      "missing 188 cards",
    );
  });

  it("says what a trade rule offers, netting or not", () => {
    const wording = ruleWording("trade", "copy");
    expect(ruleCountLabel(3, "copy", wording, false)).toBe("offers 3 copies");
    expect(ruleCountLabel(1, "copy", wording, true)).toBe("offers 1 copy");
  });

  it("says what an organize rule includes", () => {
    expect(ruleCountLabel(3, "copy", ruleWording("organize", "copy"), false)).toBe(
      "includes 3 copies",
    );
    expect(ruleCountLabel(4, "card", ruleWording("organize", "card"), false)).toBe(
      "matches 4 cards",
    );
    expect(ruleCountLabel(4, "card", ruleWording("organize", "card"), true)).toBe(
      "missing 4 cards",
    );
  });
});

describe("ruleWording", () => {
  it("treats copy lists as the supply shape and the rest as the demand shape", () => {
    expect(ruleWording("trade", "copy").isCopy).toBe(true);
    expect(ruleWording("organize", "copy").isCopy).toBe(true);
    expect(ruleWording("wish", "card").isCopy).toBe(false);
    expect(ruleWording("organize", "printing").isCopy).toBe(false);
  });

  it("offers exactly the combine modes the shared validator accepts for the kind", () => {
    for (const [intent, kind] of COMBOS) {
      const { combineOptions } = ruleWording(intent, kind);
      expect(combineOptions.length).toBeGreaterThan(0);
      for (const option of combineOptions) {
        expect(ruleCombineMatchesKind(option.value, kind)).toBe(true);
      }
      // The kind's default is always selectable, so the select never renders a
      // value that isn't in its own option list.
      expect(combineOptions.map((option) => option.value)).toContain(defaultRuleCombine(kind));
    }
  });

  it("has a hint for every offered combine mode", () => {
    for (const [intent, kind] of COMBOS) {
      const wording = ruleWording(intent, kind);
      const hints = wording.combineOptions.map((option) => wording.combineHint(option.value));
      expect(hints.every((hint) => hint.length > 0)).toBe(true);
      // Each mode reads differently, or the select would give no guidance.
      expect(new Set(hints).size).toBe(hints.length);
    }
  });

  it("names the list's own granularity in the quantity hint", () => {
    expect(ruleWording("wish", "card").quantityHint("card")).toContain("card");
    expect(ruleWording("wish", "printing").quantityHint("card")).toContain("printing");
    expect(ruleWording("organize", "printing").quantityHint("card")).toContain("printing");
  });

  it("labels copy lists by their grouping, and only copy lists have a group select", () => {
    const trade = ruleWording("trade", "copy");
    expect(trade.quantityLabel("card")).toBe("Keep per card");
    expect(trade.quantityLabel("printing")).toBe("Keep per printing");
    expect(trade.groupLabel).not.toBe("");

    const organize = ruleWording("organize", "copy");
    expect(organize.quantityLabel("card")).toBe("Leave out per card");
    expect(organize.quantityLabel("printing")).toBe("Leave out per printing");
    expect(organize.groupLabel).not.toBe("");

    // Card/printing lists never render the grouping select.
    expect(ruleWording("wish", "card").groupLabel).toBe("");
    expect(ruleWording("organize", "card").groupLabel).toBe("");
  });

  it("never offers a trade list's wording to an organize list", () => {
    const trade = ruleWording("trade", "copy");
    const organize = ruleWording("organize", "copy");
    for (const text of [organize.description, organize.emptyMessage]) {
      expect(text).not.toContain("offer");
    }
    expect(organize.description).not.toBe(trade.description);
    expect(organize.emptyMessage).not.toBe(trade.emptyMessage);
  });
});

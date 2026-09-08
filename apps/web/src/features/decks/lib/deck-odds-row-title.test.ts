import { describe, expect, it } from "vitest";

import { oddsRowTitle } from "@/features/decks/lib/deck-odds-row-title";

describe("oddsRowTitle", () => {
  it("leaves the label alone when nothing is in hand", () => {
    expect(oddsRowTitle("Yasuo", 0)).toBe("Yasuo");
  });

  it("notes a single copy without a count", () => {
    expect(oddsRowTitle("Yasuo", 1)).toBe("Yasuo (in your hand)");
  });

  it("counts multiple copies", () => {
    expect(oddsRowTitle("Yasuo", 3)).toBe("Yasuo (3 in your hand)");
  });
});

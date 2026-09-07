import { describe, expect, it } from "vitest";

import { parseManualDecklist } from "./deck-check-manual-entry";

describe("parseManualDecklist", () => {
  it("parses zone headers into section slugs", () => {
    const { cards, totalCopies } = parseManualDecklist(
      ["Champion:", "1 Some Champion", "Main:", "3 Some Card", "Sideboard:", "2 Tech Card"].join(
        "\n",
      ),
    );
    expect(cards).toEqual([
      { name: "Some Champion", quantity: 1, section: "champion" },
      { name: "Some Card", quantity: 3, section: "main" },
      { name: "Tech Card", quantity: 2, section: "sideboard" },
    ]);
    expect(totalCopies).toBe(6);
  });

  it("defaults lines without a header to the main deck", () => {
    const { cards } = parseManualDecklist("2 Lone Card");
    expect(cards).toEqual([{ name: "Lone Card", quantity: 2, section: "main" }]);
  });

  it("treats a bare line with no leading count as a single copy", () => {
    const { cards } = parseManualDecklist("Just A Name");
    expect(cards).toEqual([{ name: "Just A Name", quantity: 1, section: "main" }]);
  });

  it("skips blank lines and merges identical name+zone lines", () => {
    const { cards, totalCopies } = parseManualDecklist(
      ["Main:", "2 Repeated Card", "", "1 Repeated Card", "1 Other Card"].join("\n"),
    );
    expect(cards).toEqual([
      { name: "Repeated Card", quantity: 3, section: "main" },
      { name: "Other Card", quantity: 1, section: "main" },
    ]);
    expect(totalCopies).toBe(4);
  });

  it("keeps the same card in different zones as separate lines", () => {
    const { cards } = parseManualDecklist(
      ["Main:", "3 Versatile Card", "Sideboard:", "2 Versatile Card"].join("\n"),
    );
    expect(cards).toEqual([
      { name: "Versatile Card", quantity: 3, section: "main" },
      { name: "Versatile Card", quantity: 2, section: "sideboard" },
    ]);
  });

  it("warns on an unknown zone header without dropping later cards", () => {
    const { cards, warnings } = parseManualDecklist(["Bogus:", "1 Stray Card"].join("\n"));
    expect(warnings.some((warning) => warning.includes("Bogus:"))).toBe(true);
    expect(cards).toEqual([{ name: "Stray Card", quantity: 1, section: "main" }]);
  });

  it("returns an empty result with a warning for empty input", () => {
    const { cards, totalCopies, warnings } = parseManualDecklist("   ");
    expect(cards).toEqual([]);
    expect(totalCopies).toBe(0);
    expect(warnings.length).toBeGreaterThan(0);
  });
});

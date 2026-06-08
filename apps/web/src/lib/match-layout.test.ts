import { describe, expect, it } from "vitest";

import { perRowHeight, planSeats, scoreSizeClass, xpSizeTier } from "./match-layout";

/**
 * Flatten a layout into "id▲" tokens (▲ marks a rotated seat), row by row.
 * @returns The rows as arrays of compact id/rotation tokens.
 */
function tokens(rows: { id: string; rotated: boolean }[][]): string[][] {
  return rows.map((row) => row.map((seat) => `${seat.id}${seat.rotated ? "▲" : ""}`));
}

describe("planSeats", () => {
  describe("portrait (single column)", () => {
    it("stacks two players head to head, far side rotated", () => {
      expect(tokens(planSeats(["a", "b"], false))).toEqual([["a▲"], ["b"]]);
    });

    it("stacks three players one per row", () => {
      expect(tokens(planSeats(["a", "b", "c"], false))).toEqual([["a▲"], ["b"], ["c"]]);
    });

    it("reverses the far-side pair so seating reads clockwise (B A C D)", () => {
      expect(tokens(planSeats(["a", "b", "c", "d"], false))).toEqual([
        ["b▲"],
        ["a▲"],
        ["c"],
        ["d"],
      ]);
    });
  });

  describe("landscape (two-row grid)", () => {
    it("keeps two players in a stacked column", () => {
      expect(tokens(planSeats(["a", "b"], true))).toEqual([["a▲"], ["b"]]);
    });

    it("puts the lone far player on top of a reversed near pair", () => {
      expect(tokens(planSeats(["a", "b", "c"], true))).toEqual([["a▲"], ["c", "b"]]);
    });

    it("lays four players out as A B / D C", () => {
      expect(tokens(planSeats(["a", "b", "c", "d"], true))).toEqual([
        ["a▲", "b▲"],
        ["d", "c"],
      ]);
    });
  });

  it("handles an empty roster without throwing", () => {
    expect(planSeats([], false)).toEqual([]);
    // The near row is always present in landscape, even when empty.
    expect(planSeats([], true)).toEqual([[]]);
  });
});

describe("perRowHeight", () => {
  it("returns 0 when nothing is measured yet", () => {
    expect(perRowHeight(0, 2)).toBe(0);
    expect(perRowHeight(1000, 0)).toBe(0);
  });

  it("splits the board across its rows, accounting for the inter-row gaps", () => {
    // One row gets the whole board.
    expect(perRowHeight(300, 1)).toBe(300);
    // Two rows lose one 8px gap: (308 - 8) / 2 = 150.
    expect(perRowHeight(308, 2)).toBe(150);
    // Four rows lose three gaps: (524 - 24) / 4 = 125.
    expect(perRowHeight(524, 4)).toBe(125);
  });
});

describe("scoreSizeClass", () => {
  it("grows the score on taller panels", () => {
    expect(scoreSizeClass(400)).toBe("text-9xl");
    expect(scoreSizeClass(300)).toBe("text-8xl");
    expect(scoreSizeClass(240)).toBe("text-7xl");
    expect(scoreSizeClass(180)).toBe("text-6xl");
    expect(scoreSizeClass(150)).toBe("text-5xl");
  });

  it("falls back to the smallest size for short panels and the unmeasured case", () => {
    expect(scoreSizeClass(115)).toBe("text-4xl");
    expect(scoreSizeClass(0)).toBe("text-4xl");
  });

  it("is monotonic across the tier boundaries", () => {
    expect(scoreSizeClass(128)).toBe("text-5xl");
    expect(scoreSizeClass(127)).toBe("text-4xl");
    expect(scoreSizeClass(165)).toBe("text-6xl");
    expect(scoreSizeClass(164)).toBe("text-5xl");
  });
});

describe("xpSizeTier", () => {
  it("grows the XP cluster with the panel height", () => {
    // Cramped phone cards (portrait/landscape 4p ~122px).
    expect(xpSizeTier(122)).toBe("sm");
    // Three players / a short desktop window (~165-175px).
    expect(xpSizeTier(170)).toBe("md");
    // Two-player board (~252px) gets the big, ~double-size cluster.
    expect(xpSizeTier(252)).toBe("lg");
    // A maximized desktop window.
    expect(xpSizeTier(385)).toBe("xl");
  });

  it("treats the unmeasured case as the smallest tier", () => {
    expect(xpSizeTier(0)).toBe("sm");
  });

  it("is monotonic across the tier boundaries", () => {
    expect(xpSizeTier(145)).toBe("md");
    expect(xpSizeTier(144)).toBe("sm");
    expect(xpSizeTier(210)).toBe("lg");
    expect(xpSizeTier(209)).toBe("md");
    expect(xpSizeTier(320)).toBe("xl");
    expect(xpSizeTier(319)).toBe("lg");
  });
});

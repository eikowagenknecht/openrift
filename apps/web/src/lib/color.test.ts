import { describe, expect, it } from "vitest";

import { contrastGlyphTint, contrastText } from "./color";

// ---------------------------------------------------------------------------
// contrastText
// ---------------------------------------------------------------------------

describe("contrastText", () => {
  it("returns dark text on a white background", () => {
    expect(contrastText("#ffffff")).toBe("#1a1a1a");
  });

  it("returns light text on a black background", () => {
    expect(contrastText("#000000")).toBe("#ffffff");
  });

  it("returns dark text on light domain colors", () => {
    expect(contrastText("#CDA902")).toBe("#1a1a1a"); // order
    expect(contrastText("#E2710C")).toBe("#1a1a1a"); // body
    expect(contrastText("#16AA71")).toBe("#1a1a1a"); // calm
  });

  it("returns light text on dark domain colors", () => {
    expect(contrastText("#CB212D")).toBe("#ffffff"); // fury
    expect(contrastText("#227799")).toBe("#ffffff"); // mind
    expect(contrastText("#6B4891")).toBe("#ffffff"); // chaos
    expect(contrastText("#737373")).toBe("#ffffff"); // colorless
  });
});

// ---------------------------------------------------------------------------
// contrastGlyphTint
// ---------------------------------------------------------------------------

describe("contrastGlyphTint", () => {
  it("picks black for light backgrounds", () => {
    expect(contrastGlyphTint("#ffffff")).toBe("black");
    expect(contrastGlyphTint("#CDA902")).toBe("black");
  });

  it("picks white for dark backgrounds", () => {
    expect(contrastGlyphTint("#000000")).toBe("white");
    expect(contrastGlyphTint("#227799")).toBe("white");
  });

  it("agrees with contrastText", () => {
    for (const hex of ["#ffffff", "#000000", "#CDA902", "#16AA71", "#6B4891"]) {
      const expected = contrastText(hex) === "#ffffff" ? "white" : "black";
      expect(contrastGlyphTint(hex)).toBe(expected);
    }
  });
});

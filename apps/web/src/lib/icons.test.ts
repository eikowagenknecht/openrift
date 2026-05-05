import { describe, expect, it } from "vitest";

import { getFilterIconPath, getTypeIconPath } from "./icons";

describe("getTypeIconPath", () => {
  it("returns the standard type icon for known types", () => {
    expect(getTypeIconPath("unit", [])).toBe("/images/types/unit.svg");
    expect(getTypeIconPath("spell", [])).toBe("/images/types/spell.svg");
  });

  it("returns the champion icon for Champion/Signature Units", () => {
    expect(getTypeIconPath("unit", ["champion"])).toBe("/images/supertypes/champion.svg");
    expect(getTypeIconPath("unit", ["signature"])).toBe("/images/supertypes/champion.svg");
  });

  it("returns undefined for the Other type (no icon asset exists)", () => {
    expect(getTypeIconPath("other", [])).toBeUndefined();
  });
});

describe("getFilterIconPath", () => {
  it("returns the standard type icon for known types", () => {
    expect(getFilterIconPath("types", "unit")).toBe("/images/types/unit.svg");
  });

  it("returns undefined for the Other type (no icon asset exists)", () => {
    expect(getFilterIconPath("types", "other")).toBeUndefined();
  });

  it("returns the .svg path for the colorless domain regardless of casing", () => {
    // The colorless icon ships as an SVG; all other domains ship as .webp.
    // Callers occasionally pass non-canonical casing — both must resolve to
    // the existing file.
    expect(getFilterIconPath("domains", "colorless")).toBe("/images/domains/colorless.svg");
    expect(getFilterIconPath("domains", "Colorless")).toBe("/images/domains/colorless.svg");
  });

  it("returns the .webp path for non-colorless domains", () => {
    expect(getFilterIconPath("domains", "fury")).toBe("/images/domains/fury.webp");
    expect(getFilterIconPath("domains", "calm")).toBe("/images/domains/calm.webp");
  });
});

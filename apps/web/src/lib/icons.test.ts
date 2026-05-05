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
});

import { describe, expect, it } from "vitest";

import { getFilterIconPath, getTypeIconPath } from "./icons";

describe("getTypeIconPath", () => {
  it("returns the standard type icon for known types", () => {
    expect(getTypeIconPath("Unit", [])).toBe("/images/types/unit.svg");
    expect(getTypeIconPath("Spell", [])).toBe("/images/types/spell.svg");
  });

  it("returns the champion icon for Champion/Signature Units", () => {
    expect(getTypeIconPath("Unit", ["Champion"])).toBe("/images/supertypes/champion.svg");
    expect(getTypeIconPath("Unit", ["Signature"])).toBe("/images/supertypes/champion.svg");
  });

  it("returns undefined for the Other type (no icon asset exists)", () => {
    expect(getTypeIconPath("Other", [])).toBeUndefined();
  });
});

describe("getFilterIconPath", () => {
  it("returns the standard type icon for known types", () => {
    expect(getFilterIconPath("types", "Unit")).toBe("/images/types/unit.svg");
  });

  it("returns undefined for the Other type (no icon asset exists)", () => {
    expect(getFilterIconPath("types", "Other")).toBeUndefined();
  });
});

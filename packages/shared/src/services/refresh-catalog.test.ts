import { describe, expect, it } from "bun:test";

import { getFinishes } from "./refresh-catalog";

describe("getFinishes", () => {
  it("returns normal only for OGS set", () => {
    expect(getFinishes("OGS", "Unit", [], "Rare")).toEqual(["normal"]);
  });

  it("returns normal only for OGS regardless of rarity", () => {
    expect(getFinishes("OGS", "Spell", [], "Common")).toEqual(["normal"]);
  });

  it("returns normal only for Token superType", () => {
    expect(getFinishes("SET1", "Unit", ["Token"], "Common")).toEqual(["normal"]);
  });

  it("returns normal only for non-Showcase Rune", () => {
    expect(getFinishes("SET1", "Rune", [], "Common")).toEqual(["normal"]);
  });

  it("returns normal only for Rare Rune (non-Showcase)", () => {
    expect(getFinishes("SET1", "Rune", [], "Rare")).toEqual(["normal"]);
  });

  it("returns normal only for Epic Rune (non-Showcase)", () => {
    expect(getFinishes("SET1", "Rune", [], "Epic")).toEqual(["normal"]);
  });

  it("returns foil only for Showcase Rune", () => {
    expect(getFinishes("SET1", "Rune", [], "Showcase")).toEqual(["foil"]);
  });

  it("returns both for Common", () => {
    expect(getFinishes("SET1", "Unit", [], "Common")).toEqual(["normal", "foil"]);
  });

  it("returns both for Uncommon", () => {
    expect(getFinishes("SET1", "Unit", [], "Uncommon")).toEqual(["normal", "foil"]);
  });

  it("returns foil only for Rare", () => {
    expect(getFinishes("SET1", "Unit", [], "Rare")).toEqual(["foil"]);
  });

  it("returns foil only for Epic", () => {
    expect(getFinishes("SET1", "Unit", [], "Epic")).toEqual(["foil"]);
  });

  it("returns foil only for Showcase (non-Rune)", () => {
    expect(getFinishes("SET1", "Unit", [], "Showcase")).toEqual(["foil"]);
  });

  it("Token takes priority over rarity rules", () => {
    expect(getFinishes("SET1", "Spell", ["Token"], "Rare")).toEqual(["normal"]);
  });

  it("OGS takes priority over Token", () => {
    expect(getFinishes("OGS", "Unit", ["Token"], "Epic")).toEqual(["normal"]);
  });
});

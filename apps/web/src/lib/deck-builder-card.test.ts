import type { DeckZone, SuperType } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import { isCardAllowedInZone } from "./deck-builder-card";

describe("isCardAllowedInZone", () => {
  it("allows Legend cards only in the legend zone", () => {
    const legend = { cardType: "Legend" as const, superTypes: [] as SuperType[] };
    expect(isCardAllowedInZone(legend, "legend")).toBe(true);
    expect(isCardAllowedInZone(legend, "main")).toBe(false);
    expect(isCardAllowedInZone(legend, "sideboard")).toBe(false);
    expect(isCardAllowedInZone(legend, "champion")).toBe(false);
    expect(isCardAllowedInZone(legend, "runes")).toBe(false);
    expect(isCardAllowedInZone(legend, "battlefield")).toBe(false);
  });

  it("allows Champion supertype in champion zone but not Legends", () => {
    const champion = { cardType: "Unit" as const, superTypes: ["Champion"] as SuperType[] };
    expect(isCardAllowedInZone(champion, "champion")).toBe(true);
    expect(isCardAllowedInZone(champion, "main")).toBe(true);

    const legendChampion = {
      cardType: "Legend" as const,
      superTypes: ["Champion"] as SuperType[],
    };
    expect(isCardAllowedInZone(legendChampion, "champion")).toBe(false);
  });

  it("allows Rune cards only in runes zone", () => {
    const rune = { cardType: "Rune" as const, superTypes: [] as SuperType[] };
    expect(isCardAllowedInZone(rune, "runes")).toBe(true);
    expect(isCardAllowedInZone(rune, "main")).toBe(false);
    expect(isCardAllowedInZone(rune, "sideboard")).toBe(false);
  });

  it("allows Battlefield cards only in battlefield zone", () => {
    const battlefield = { cardType: "Battlefield" as const, superTypes: [] as SuperType[] };
    expect(isCardAllowedInZone(battlefield, "battlefield")).toBe(true);
    expect(isCardAllowedInZone(battlefield, "main")).toBe(false);
  });

  it("allows Unit/Spell/Gear in main, sideboard, overflow", () => {
    for (const cardType of ["Unit", "Spell", "Gear"] as const) {
      const card = { cardType, superTypes: [] as SuperType[] };
      expect(isCardAllowedInZone(card, "main")).toBe(true);
      expect(isCardAllowedInZone(card, "sideboard")).toBe(true);
      expect(isCardAllowedInZone(card, "overflow")).toBe(true);
    }
  });

  it("returns false for unknown zones", () => {
    const card = { cardType: "Unit" as const, superTypes: [] as SuperType[] };
    expect(isCardAllowedInZone(card, "unknown" as DeckZone)).toBe(false);
  });
});

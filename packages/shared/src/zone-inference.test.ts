import { describe, expect, it } from "vitest";

import { inferZone, sourceSlotForZone } from "./zone-inference.js";

describe("inferZone", () => {
  it("maps chosenChampion to champion zone regardless of card type", () => {
    expect(inferZone(["unit"], ["champion"], "chosenChampion")).toBe("champion");
    expect(inferZone(["unit"], [], "chosenChampion")).toBe("champion");
  });

  it("maps sideboard to sideboard zone regardless of card type", () => {
    expect(inferZone(["unit"], [], "sideboard")).toBe("sideboard");
    expect(inferZone(["spell"], [], "sideboard")).toBe("sideboard");
    expect(inferZone(["rune"], [], "sideboard")).toBe("sideboard");
  });

  it("maps Legend type from mainDeck to legend zone", () => {
    expect(inferZone(["legend"], [], "mainDeck")).toBe("legend");
  });

  it("maps Rune type from mainDeck to runes zone", () => {
    expect(inferZone(["rune"], [], "mainDeck")).toBe("runes");
  });

  it("maps Battlefield type from mainDeck to battlefield zone", () => {
    expect(inferZone(["battlefield"], [], "mainDeck")).toBe("battlefield");
  });

  it("maps Unit from mainDeck to main zone", () => {
    expect(inferZone(["unit"], [], "mainDeck")).toBe("main");
  });

  it("maps Spell from mainDeck to main zone", () => {
    expect(inferZone(["spell"], [], "mainDeck")).toBe("main");
  });

  it("maps multi-type main-deck cards (Unit Gear) to main zone", () => {
    expect(inferZone(["unit", "gear"], [], "mainDeck")).toBe("main");
  });

  it("maps a multi-type card to a single-zone type if any type demands it", () => {
    expect(inferZone(["unit", "battlefield"], [], "mainDeck")).toBe("battlefield");
    expect(inferZone(["unit", "rune"], [], "mainDeck")).toBe("runes");
  });

  it("maps Gear from mainDeck to main zone", () => {
    expect(inferZone(["gear"], [], "mainDeck")).toBe("main");
  });

  it("maps Champion supertype from mainDeck to main zone (extra copies)", () => {
    expect(inferZone(["unit"], ["champion"], "mainDeck")).toBe("main");
  });

  it("maps Other type from mainDeck to main zone", () => {
    expect(inferZone(["other"], [], "mainDeck")).toBe("main");
  });
});

describe("sourceSlotForZone", () => {
  it("maps the two zones that have their own slot", () => {
    expect(sourceSlotForZone("champion")).toBe("chosenChampion");
    expect(sourceSlotForZone("sideboard")).toBe("sideboard");
  });

  it("maps every other zone to the main deck", () => {
    for (const zone of ["main", "legend", "runes", "battlefield", "overflow"] as const) {
      expect(sourceSlotForZone(zone)).toBe("mainDeck");
    }
  });

  it("round-trips through inferZone for the slot-carrying zones", () => {
    expect(inferZone(["unit"], [], sourceSlotForZone("champion"))).toBe("champion");
    expect(inferZone(["unit"], [], sourceSlotForZone("sideboard"))).toBe("sideboard");
  });
});

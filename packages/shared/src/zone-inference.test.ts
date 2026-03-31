import { describe, expect, it } from "bun:test";

import { inferZone } from "./zone-inference.js";

describe("inferZone", () => {
  it("maps chosenChampion to champion zone regardless of card type", () => {
    expect(inferZone("Unit", ["Champion"], "chosenChampion")).toBe("champion");
    expect(inferZone("Unit", [], "chosenChampion")).toBe("champion");
  });

  it("maps sideboard to sideboard zone regardless of card type", () => {
    expect(inferZone("Unit", [], "sideboard")).toBe("sideboard");
    expect(inferZone("Spell", [], "sideboard")).toBe("sideboard");
    expect(inferZone("Rune", [], "sideboard")).toBe("sideboard");
  });

  it("maps Legend type from mainDeck to legend zone", () => {
    expect(inferZone("Legend", [], "mainDeck")).toBe("legend");
  });

  it("maps Rune type from mainDeck to runes zone", () => {
    expect(inferZone("Rune", [], "mainDeck")).toBe("runes");
  });

  it("maps Battlefield type from mainDeck to battlefield zone", () => {
    expect(inferZone("Battlefield", [], "mainDeck")).toBe("battlefield");
  });

  it("maps Unit from mainDeck to main zone", () => {
    expect(inferZone("Unit", [], "mainDeck")).toBe("main");
  });

  it("maps Spell from mainDeck to main zone", () => {
    expect(inferZone("Spell", [], "mainDeck")).toBe("main");
  });

  it("maps Gear from mainDeck to main zone", () => {
    expect(inferZone("Gear", [], "mainDeck")).toBe("main");
  });

  it("maps Champion supertype from mainDeck to main zone (extra copies)", () => {
    expect(inferZone("Unit", ["Champion"], "mainDeck")).toBe("main");
  });

  it("maps Other type from mainDeck to main zone", () => {
    expect(inferZone("Other", [], "mainDeck")).toBe("main");
  });
});

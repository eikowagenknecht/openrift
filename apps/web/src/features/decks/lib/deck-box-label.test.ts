import { describe, expect, it } from "vitest";

import { deckBoxLabel, sharedBoxWarning } from "./deck-box-label";

describe("deckBoxLabel", () => {
  it("says nothing for a collection no deck lives in", () => {
    expect(deckBoxLabel([])).toBeUndefined();
  });

  it("names a single deck", () => {
    expect(deckBoxLabel([{ name: "Sunfire Aggro" }])).toBe("Deck box for Sunfire Aggro");
  });

  it("names both decks when two share the box", () => {
    expect(deckBoxLabel([{ name: "Sunfire Aggro" }, { name: "Frostguard" }])).toBe(
      "Deck box for Sunfire Aggro and Frostguard",
    );
  });

  it("counts instead of listing beyond two", () => {
    expect(
      deckBoxLabel([{ name: "Sunfire Aggro" }, { name: "Frostguard" }, { name: "Tidecaller" }]),
    ).toBe("Deck box for 3 decks");
  });
});

describe("sharedBoxWarning", () => {
  it("says nothing about a free box", () => {
    expect(sharedBoxWarning("Deckbox 1", [])).toBeUndefined();
  });

  it("names the deck already living there", () => {
    expect(sharedBoxWarning("Deckbox 1", [{ name: "Sunfire Aggro" }])).toBe(
      "Deckbox 1 is already the box for Sunfire Aggro. Two decks can share one box.",
    );
  });

  it("counts several occupants", () => {
    expect(sharedBoxWarning("Deckbox 1", [{ name: "Sunfire Aggro" }, { name: "Frostguard" }])).toBe(
      "Deckbox 1 is already the box for 2 other decks. They can share it.",
    );
  });
});

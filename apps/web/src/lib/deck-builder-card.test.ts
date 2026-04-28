import type { DeckZone, SuperType } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import { isCardAllowedInZone, isDeckZoneFullForDrag } from "./deck-builder-card";

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

describe("isDeckZoneFullForDrag", () => {
  const cardId = "card-1";

  it("allows dropping back into the source zone when at the 3-copy cap", () => {
    // Regression: previously, dragging a card at 3 copies disabled every
    // copy-limit zone — including its own source — forcing the user to discard.
    const allCards = [{ cardId, zone: "main" as DeckZone, quantity: 3 }];
    expect(
      isDeckZoneFullForDrag({ zone: "main", draggedCardId: cardId, fromZone: "main", allCards }),
    ).toBe(false);
  });

  it("allows cross-zone moves between copy-limit zones at the cap", () => {
    // Move preserves the cross-zone total, so the cap is not violated.
    const allCards = [
      { cardId, zone: "main" as DeckZone, quantity: 2 },
      { cardId, zone: "sideboard" as DeckZone, quantity: 1 },
    ];
    expect(
      isDeckZoneFullForDrag({
        zone: "sideboard",
        draggedCardId: cardId,
        fromZone: "main",
        allCards,
      }),
    ).toBe(false);
  });

  it("blocks browser-card adds when the cross-zone total is at the cap", () => {
    const allCards = [
      { cardId, zone: "main" as DeckZone, quantity: 2 },
      { cardId, zone: "sideboard" as DeckZone, quantity: 1 },
    ];
    expect(
      isDeckZoneFullForDrag({ zone: "main", draggedCardId: cardId, fromZone: null, allCards }),
    ).toBe(true);
    expect(
      isDeckZoneFullForDrag({
        zone: "overflow",
        draggedCardId: cardId,
        fromZone: null,
        allCards,
      }),
    ).toBe(true);
  });

  it("allows browser-card adds below the cap", () => {
    const allCards = [{ cardId, zone: "main" as DeckZone, quantity: 2 }];
    expect(
      isDeckZoneFullForDrag({ zone: "main", draggedCardId: cardId, fromZone: null, allCards }),
    ).toBe(false);
  });

  it("blocks battlefield drops when the card already sits in battlefield", () => {
    const allCards = [{ cardId, zone: "battlefield" as DeckZone, quantity: 1 }];
    expect(
      isDeckZoneFullForDrag({
        zone: "battlefield",
        draggedCardId: cardId,
        fromZone: null,
        allCards,
      }),
    ).toBe(true);
  });

  it("blocks rune drops when the rune zone holds 12 cards", () => {
    const allCards = Array.from({ length: 12 }, (_, index) => ({
      cardId: `rune-${index}`,
      zone: "runes" as DeckZone,
      quantity: 1,
    }));
    expect(
      isDeckZoneFullForDrag({
        zone: "runes",
        draggedCardId: "rune-new",
        fromZone: null,
        allCards,
      }),
    ).toBe(true);
  });

  it("returns false for non-capped zones (legend)", () => {
    expect(
      isDeckZoneFullForDrag({
        zone: "legend",
        draggedCardId: cardId,
        fromZone: null,
        allCards: [],
      }),
    ).toBe(false);
  });
});

import type { DeckZone, SuperType } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import {
  buildDeckQuantityByCell,
  cellPreferredPrintingId,
  getAllowedMoveTargets,
  isCardAllowedInZone,
  isDeckZoneFullForDrag,
} from "./deck-builder-card";

describe("isCardAllowedInZone", () => {
  it("allows Legend cards only in the legend zone", () => {
    const legend = { cardType: "legend" as const, superTypes: [] as SuperType[] };
    expect(isCardAllowedInZone(legend, "legend")).toBe(true);
    expect(isCardAllowedInZone(legend, "main")).toBe(false);
    expect(isCardAllowedInZone(legend, "sideboard")).toBe(false);
    expect(isCardAllowedInZone(legend, "champion")).toBe(false);
    expect(isCardAllowedInZone(legend, "runes")).toBe(false);
    expect(isCardAllowedInZone(legend, "battlefield")).toBe(false);
  });

  it("allows Champion supertype in champion zone but not Legends", () => {
    const champion = { cardType: "unit" as const, superTypes: ["champion"] as SuperType[] };
    expect(isCardAllowedInZone(champion, "champion")).toBe(true);
    expect(isCardAllowedInZone(champion, "main")).toBe(true);

    const legendChampion = {
      cardType: "legend" as const,
      superTypes: ["champion"] as SuperType[],
    };
    expect(isCardAllowedInZone(legendChampion, "champion")).toBe(false);
  });

  it("allows Rune cards only in runes zone", () => {
    const rune = { cardType: "rune" as const, superTypes: [] as SuperType[] };
    expect(isCardAllowedInZone(rune, "runes")).toBe(true);
    expect(isCardAllowedInZone(rune, "main")).toBe(false);
    expect(isCardAllowedInZone(rune, "sideboard")).toBe(false);
  });

  it("allows Battlefield cards only in battlefield zone", () => {
    const battlefield = { cardType: "battlefield" as const, superTypes: [] as SuperType[] };
    expect(isCardAllowedInZone(battlefield, "battlefield")).toBe(true);
    expect(isCardAllowedInZone(battlefield, "main")).toBe(false);
  });

  it("allows Unit/Spell/Gear in main, sideboard, overflow", () => {
    for (const cardType of ["unit", "spell", "gear"] as const) {
      const card = { cardType, superTypes: [] as SuperType[] };
      expect(isCardAllowedInZone(card, "main")).toBe(true);
      expect(isCardAllowedInZone(card, "sideboard")).toBe(true);
      expect(isCardAllowedInZone(card, "overflow")).toBe(true);
    }
  });

  it("returns false for unknown zones", () => {
    const card = { cardType: "unit" as const, superTypes: [] as SuperType[] };
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
      isDeckZoneFullForDrag({
        zone: "main",
        draggedCardId: cardId,
        fromZone: "main",
        allCards,
        format: "constructed",
      }),
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
        format: "constructed",
      }),
    ).toBe(false);
  });

  it("blocks browser-card adds when the cross-zone total is at the cap", () => {
    const allCards = [
      { cardId, zone: "main" as DeckZone, quantity: 2 },
      { cardId, zone: "sideboard" as DeckZone, quantity: 1 },
    ];
    expect(
      isDeckZoneFullForDrag({
        zone: "main",
        draggedCardId: cardId,
        fromZone: null,
        allCards,
        format: "constructed",
      }),
    ).toBe(true);
    expect(
      isDeckZoneFullForDrag({
        zone: "overflow",
        draggedCardId: cardId,
        fromZone: null,
        allCards,
        format: "constructed",
      }),
    ).toBe(true);
  });

  it("allows browser-card adds below the cap", () => {
    const allCards = [{ cardId, zone: "main" as DeckZone, quantity: 2 }];
    expect(
      isDeckZoneFullForDrag({
        zone: "main",
        draggedCardId: cardId,
        fromZone: null,
        allCards,
        format: "constructed",
      }),
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
        format: "constructed",
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
        format: "constructed",
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
        format: "constructed",
      }),
    ).toBe(false);
  });

  it("returns false for any zone in freeform format", () => {
    const allCards = [{ cardId, zone: "main" as DeckZone, quantity: 3 }];
    expect(
      isDeckZoneFullForDrag({
        zone: "main",
        draggedCardId: cardId,
        fromZone: null,
        allCards,
        format: "freeform",
      }),
    ).toBe(false);
  });
});

describe("cellPreferredPrintingId", () => {
  it("always targets the default-art (null) row in cards view", () => {
    expect(cellPreferredPrintingId("cards", "printing-1", "printing-1")).toBeNull();
    expect(cellPreferredPrintingId("cards", "printing-2", "printing-1")).toBeNull();
    expect(cellPreferredPrintingId("cards", "printing-2", null)).toBeNull();
  });

  it("targets the null row for the card's default printing cell in printings view", () => {
    expect(cellPreferredPrintingId("printings", "printing-1", "printing-1")).toBeNull();
  });

  it("pins every non-default printing cell to its own id in printings view", () => {
    expect(cellPreferredPrintingId("printings", "printing-2", "printing-1")).toBe("printing-2");
  });

  it("pins the printing when the card has no resolvable default", () => {
    expect(cellPreferredPrintingId("printings", "printing-2", undefined)).toBe("printing-2");
    expect(cellPreferredPrintingId("printings", "printing-2", null)).toBe("printing-2");
  });
});

describe("buildDeckQuantityByCell", () => {
  const defaults: Record<string, string> = { "card-a": "a-default", "card-b": "b-default" };
  const defaultFor = (cardId: string): string | undefined => defaults[cardId];

  it("counts a pinned row on its own printing cell", () => {
    const byCell = buildDeckQuantityByCell(
      [{ cardId: "card-a", quantity: 2, preferredPrintingId: "a-alt" }],
      defaultFor,
    );
    expect(byCell.get("a-alt")).toBe(2);
    expect(byCell.get("a-default")).toBeUndefined();
  });

  it("attributes a default-art (null) row to the card's canonical printing cell", () => {
    const byCell = buildDeckQuantityByCell(
      [{ cardId: "card-a", quantity: 3, preferredPrintingId: null }],
      defaultFor,
    );
    expect(byCell.get("a-default")).toBe(3);
  });

  it("merges a null row and a row pinned to the same default printing", () => {
    const byCell = buildDeckQuantityByCell(
      [
        { cardId: "card-a", quantity: 2, preferredPrintingId: null },
        { cardId: "card-a", quantity: 1, preferredPrintingId: "a-default" },
      ],
      defaultFor,
    );
    expect(byCell.get("a-default")).toBe(3);
  });

  it("keeps distinct printings of the same card on separate cells", () => {
    const byCell = buildDeckQuantityByCell(
      [
        { cardId: "card-a", quantity: 2, preferredPrintingId: "a-default" },
        { cardId: "card-a", quantity: 1, preferredPrintingId: "a-alt" },
      ],
      defaultFor,
    );
    expect(byCell.get("a-default")).toBe(2);
    expect(byCell.get("a-alt")).toBe(1);
  });

  it("sums copies of the same printing across zones", () => {
    const byCell = buildDeckQuantityByCell(
      [
        { cardId: "card-a", quantity: 2, preferredPrintingId: "a-alt" },
        { cardId: "card-a", quantity: 1, preferredPrintingId: "a-alt" },
      ],
      defaultFor,
    );
    expect(byCell.get("a-alt")).toBe(3);
  });

  it("skips a null-art row when the card has no resolvable default printing", () => {
    const byCell = buildDeckQuantityByCell(
      [{ cardId: "card-unknown", quantity: 2, preferredPrintingId: null }],
      defaultFor,
    );
    expect(byCell.size).toBe(0);
  });
});

describe("getAllowedMoveTargets", () => {
  it("offers champion + sideboard/overflow for a Champion unit currently in main, in sidebar order", () => {
    const card = {
      cardType: "unit" as const,
      superTypes: ["champion"] as SuperType[],
      zone: "main" as DeckZone,
    };
    expect(getAllowedMoveTargets(card)).toEqual(["champion", "sideboard", "overflow"]);
  });

  it("excludes the current zone", () => {
    const card = {
      cardType: "unit" as const,
      superTypes: [] as SuperType[],
      zone: "sideboard" as DeckZone,
    };
    expect(getAllowedMoveTargets(card)).toEqual(["main", "overflow"]);
  });

  it("returns an empty list when no other zone is allowed (Legend in legend)", () => {
    const card = {
      cardType: "legend" as const,
      superTypes: [] as SuperType[],
      zone: "legend" as DeckZone,
    };
    expect(getAllowedMoveTargets(card)).toEqual([]);
  });

  it("returns an empty list for a Rune in runes", () => {
    const card = {
      cardType: "rune" as const,
      superTypes: [] as SuperType[],
      zone: "runes" as DeckZone,
    };
    expect(getAllowedMoveTargets(card)).toEqual([]);
  });

  it("returns an empty list for a Battlefield card in battlefield", () => {
    const card = {
      cardType: "battlefield" as const,
      superTypes: [] as SuperType[],
      zone: "battlefield" as DeckZone,
    };
    expect(getAllowedMoveTargets(card)).toEqual([]);
  });

  it("lets a Champion move out of the champion zone into main/sideboard/overflow", () => {
    const card = {
      cardType: "unit" as const,
      superTypes: ["champion"] as SuperType[],
      zone: "champion" as DeckZone,
    };
    expect(getAllowedMoveTargets(card)).toEqual(["main", "sideboard", "overflow"]);
  });
});

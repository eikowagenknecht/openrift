import { describe, expect, it } from "vitest";

import { stubDeckBuilderCard } from "@/test/factories";

import { toEncodeDeckCards } from "./deck-encode-input";

describe("toEncodeDeckCards", () => {
  it("maps a builder card to the encode payload fields", () => {
    const card = stubDeckBuilderCard({
      cardId: "card-1",
      zone: "main",
      quantity: 3,
      preferredPrintingId: "printing-1",
      cardName: "Ashe",
      cardType: "unit",
      superTypes: ["champion"],
      domains: ["fury"],
    });

    const result = toEncodeDeckCards([card]);

    expect(result).toEqual([
      {
        cardId: "card-1",
        zone: "main",
        quantity: 3,
        preferredPrintingId: "printing-1",
        cardName: "Ashe",
        cardType: "unit",
        superTypes: ["champion"],
        domains: ["fury"],
      },
    ]);
  });

  it("preserves a null preferredPrintingId", () => {
    const card = stubDeckBuilderCard({ preferredPrintingId: null });

    const [result] = toEncodeDeckCards([card]);

    expect(result?.preferredPrintingId).toBeNull();
  });

  it("drops fields not part of the encode payload", () => {
    const card = stubDeckBuilderCard({
      cardTypes: ["unit"],
      tags: ["some-tag"],
      keywords: ["quick"],
      maxCopiesOverride: 5,
      energy: 2,
      might: 3,
      power: 4,
    });

    const [result] = toEncodeDeckCards([card]);

    expect(result).not.toHaveProperty("cardTypes");
    expect(result).not.toHaveProperty("tags");
    expect(result).not.toHaveProperty("keywords");
    expect(result).not.toHaveProperty("maxCopiesOverride");
    expect(result).not.toHaveProperty("energy");
    expect(result).not.toHaveProperty("might");
    expect(result).not.toHaveProperty("power");
  });

  it("returns an empty array for empty input", () => {
    expect(toEncodeDeckCards([])).toEqual([]);
  });

  it("maps multiple cards preserving order", () => {
    const cards = [
      stubDeckBuilderCard({ cardId: "card-1" }),
      stubDeckBuilderCard({ cardId: "card-2" }),
    ];

    const result = toEncodeDeckCards(cards);

    expect(result.map((c) => c.cardId)).toEqual(["card-1", "card-2"]);
  });
});

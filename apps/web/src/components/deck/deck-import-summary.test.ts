import type { Card } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import { stubCard } from "@/test/factories";

import { toBuilderCards } from "./deck-import-summary";

const cardsById: Record<string, Card> = {
  "card-legend": stubCard({ name: "Soul's Reflection", types: ["legend"], domains: ["fury"] }),
  "card-unit": stubCard({ name: "Sun Disc Guardian", energy: 4, power: 3, domains: ["order"] }),
};

describe("toBuilderCards", () => {
  it("carries the catalog metadata the stats need", () => {
    const [card] = toBuilderCards(
      [{ cardId: "card-unit", zone: "main", quantity: 3, preferredPrintingId: "printing-1" }],
      cardsById,
    );

    expect(card).toMatchObject({
      cardId: "card-unit",
      cardName: "Sun Disc Guardian",
      zone: "main",
      quantity: 3,
      preferredPrintingId: "printing-1",
      energy: 4,
      power: 3,
      domains: ["order"],
    });
  });

  // The preview lets a row be re-pointed at any card in the catalog, so a stale
  // row is not reachable in practice — but a dropped row must not become an
  // entry with no energy, which would skew the curve rather than leave it out.
  it("drops rows whose card is not in the catalog", () => {
    expect(
      toBuilderCards(
        [
          { cardId: "card-unit", zone: "main", quantity: 1, preferredPrintingId: null },
          { cardId: "card-gone", zone: "main", quantity: 2, preferredPrintingId: null },
        ],
        cardsById,
      ),
    ).toHaveLength(1);
  });

  it("returns nothing for an empty import", () => {
    expect(toBuilderCards([], cardsById)).toEqual([]);
  });
});

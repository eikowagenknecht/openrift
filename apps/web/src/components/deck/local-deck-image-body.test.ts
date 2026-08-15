import { WellKnown } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import { buildLocalDeckImageBody } from "@/components/deck/local-deck-image-body";
import { stubDeckBuilderCard } from "@/test/factories";

describe("buildLocalDeckImageBody", () => {
  it("carries the deck identity and encoded cards", () => {
    const card = stubDeckBuilderCard({ cardId: "card-1", quantity: 3 });

    const body = buildLocalDeckImageBody(
      "Ionia Tempo",
      WellKnown.deckFormat.CONSTRUCTED,
      "Summoner",
      [card],
    );

    expect(body.deckName).toBe("Ionia Tempo");
    expect(body.format).toBe(WellKnown.deckFormat.CONSTRUCTED);
    expect(body.ownerName).toBe("Summoner");
    expect(body.cards).toHaveLength(1);
    expect(body.cards[0]).toMatchObject({ cardId: "card-1", quantity: 3 });
  });

  it("falls back to empty strings for a nameless deck and an anonymous owner", () => {
    const body = buildLocalDeckImageBody(undefined, undefined, undefined, []);

    expect(body).toEqual({ deckName: "", format: undefined, ownerName: "", cards: [] });
  });
});

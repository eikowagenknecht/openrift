import type { PublicDeckCardResponse } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import { deckRuneSplit, deckTypeSplit } from "./meta-deck-composition";

function card(
  zone: string,
  cardType: string,
  quantity: number,
  domains: string[] = [],
): PublicDeckCardResponse {
  return {
    cardId: `${zone}-${cardType}-${domains.join("-")}-${quantity}`,
    zone,
    quantity,
    cardType,
    cardTypes: [cardType],
    domains,
  } as unknown as PublicDeckCardResponse;
}

describe("deckTypeSplit", () => {
  it("counts main-deck copies per type", () => {
    const split = deckTypeSplit([
      card("main", "unit", 3),
      card("main", "unit", 2),
      card("main", "spell", 4),
      card("main", "gear", 1),
    ]);

    expect(split).toEqual({ units: 5, spells: 4, gear: 1, total: 10 });
  });

  it("leaves the sideboard and the singleton zones out", () => {
    const split = deckTypeSplit([
      card("main", "unit", 3),
      card("sideboard", "unit", 2),
      card("legend", "legend", 1),
      card("champion", "unit", 1),
      card("battlefield", "battlefield", 3),
      card("runes", "rune", 12),
    ]);

    expect(split).toEqual({ units: 3, spells: 0, gear: 0, total: 3 });
  });

  it("keeps an uncounted main-deck type out of the total, so the bar still fills", () => {
    const split = deckTypeSplit([card("main", "unit", 3), card("main", "other", 5)]);

    expect(split.total).toBe(3);
  });

  it("returns zeroes for an empty list", () => {
    expect(deckTypeSplit([])).toEqual({ units: 0, spells: 0, gear: 0, total: 0 });
  });
});

describe("deckRuneSplit", () => {
  it("counts rune-zone copies per domain, biggest first", () => {
    const split = deckRuneSplit([
      card("runes", "rune", 4, ["fury"]),
      card("runes", "rune", 2, ["fury"]),
      card("runes", "rune", 8, ["calm"]),
    ]);

    expect(split).toEqual([
      { domain: "calm", count: 8 },
      { domain: "fury", count: 6 },
    ]);
  });

  it("breaks a tie on the domain name, so the order never wanders", () => {
    const split = deckRuneSplit([
      card("runes", "rune", 3, ["order"]),
      card("runes", "rune", 3, ["body"]),
      card("runes", "rune", 3, ["mind"]),
    ]);

    expect(split.map((entry) => entry.domain)).toEqual(["body", "mind", "order"]);
  });

  it("counts a dual-domain rune under both domains", () => {
    const split = deckRuneSplit([card("runes", "rune", 2, ["fury", "calm"])]);

    expect(split).toEqual([
      { domain: "calm", count: 2 },
      { domain: "fury", count: 2 },
    ]);
  });

  it("ignores domains carried by cards outside the rune zone", () => {
    const split = deckRuneSplit([
      card("main", "unit", 3, ["fury"]),
      card("legend", "legend", 1, ["chaos"]),
      card("runes", "rune", 5, ["order"]),
    ]);

    expect(split).toEqual([{ domain: "order", count: 5 }]);
  });

  it("returns nothing for a list with no runes", () => {
    expect(deckRuneSplit([])).toEqual([]);
    expect(deckRuneSplit([card("main", "unit", 3)])).toEqual([]);
  });
});

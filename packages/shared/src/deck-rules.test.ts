import { describe, expect, it } from "bun:test";

import type { DeckCard, DeckState } from "./deck-rules";
import {
  battlefieldAllTypeBattlefield,
  battlefieldExactlyThree,
  battlefieldNoDuplicates,
  championCopyLimitAcrossZones,
  championExactlyOne,
  championSharesTagWithLegend,
  legendExactlyOne,
  mainDeckCopyLimit,
  mainDeckExactly,
  runesAllTypeRune,
  runesExactlyTwelve,
  runesMatchLegendDomains,
  sideboardCopyLimit,
  sideboardMaximum,
  uniqueCopyLimit,
  validateDeck,
} from "./deck-rules";

function makeCard(overrides: Partial<DeckCard> = {}): DeckCard {
  return {
    cardId: "card-1",
    zone: "main",
    quantity: 1,
    cardName: "Test Card",
    cardType: "Unit",
    superTypes: [],
    domains: ["Fury"],
    tags: [],
    keywords: [],
    ...overrides,
  };
}

function makeLegend(overrides: Partial<DeckCard> = {}): DeckCard {
  return makeCard({
    cardId: "legend-1",
    zone: "legend",
    cardName: "Fire Lord",
    cardType: "Legend",
    domains: ["Fury", "Body"],
    tags: ["FireLord"],
    ...overrides,
  });
}

function makeChampion(overrides: Partial<DeckCard> = {}): DeckCard {
  return makeCard({
    cardId: "champion-1",
    zone: "champion",
    cardName: "Fire Champion",
    cardType: "Unit",
    superTypes: ["Champion"],
    domains: ["Fury"],
    tags: ["FireLord"],
    ...overrides,
  });
}

function makeRune(domain: "Fury" | "Body", cardId?: string): DeckCard {
  return makeCard({
    cardId: cardId ?? `rune-${domain.toLowerCase()}-${Math.random().toString(36).slice(2, 6)}`,
    zone: "runes",
    cardName: `${domain} Rune`,
    cardType: "Rune",
    domains: [domain],
  });
}

function makeBattlefield(cardId: string): DeckCard {
  return makeCard({
    cardId,
    zone: "battlefield",
    cardName: `Battlefield ${cardId}`,
    cardType: "Battlefield",
    domains: [],
  });
}

function makeConstructedShell(): DeckCard[] {
  return [
    makeLegend(),
    makeChampion(),
    ...Array.from({ length: 6 }, (_, index) => makeRune("Fury", `rune-fury-${index}`)),
    ...Array.from({ length: 6 }, (_, index) => makeRune("Body", `rune-body-${index}`)),
    makeBattlefield("bf-1"),
    makeBattlefield("bf-2"),
    makeBattlefield("bf-3"),
  ];
}

function makeState(
  cards: DeckCard[],
  format: "constructed" | "freeform" = "constructed",
): DeckState {
  return { format, cards };
}

// ── legendExactlyOne ────────────────────────────────────────────────────────

describe("legendExactlyOne", () => {
  it("passes with exactly 1 Legend", () => {
    expect(legendExactlyOne(makeState([makeLegend()]))).toEqual([]);
  });

  it("fails when no legend", () => {
    const violations = legendExactlyOne(makeState([]));
    expect(violations).toHaveLength(1);
    expect(violations[0].code).toBe("LEGEND_REQUIRED");
  });

  it("fails when more than 1 legend", () => {
    const violations = legendExactlyOne(makeState([makeLegend({ quantity: 2 })]));
    expect(violations).toHaveLength(1);
    expect(violations[0].code).toBe("LEGEND_TOO_MANY");
  });

  it("fails when legend zone has non-Legend type", () => {
    const violations = legendExactlyOne(makeState([makeLegend({ cardType: "Unit" })]));
    expect(violations).toHaveLength(1);
    expect(violations[0].code).toBe("LEGEND_WRONG_TYPE");
  });
});

// ── championExactlyOne ──────────────────────────────────────────────────────

describe("championExactlyOne", () => {
  it("passes with exactly 1 Champion", () => {
    expect(championExactlyOne(makeState([makeChampion()]))).toEqual([]);
  });

  it("fails when no champion", () => {
    const violations = championExactlyOne(makeState([]));
    expect(violations).toHaveLength(1);
    expect(violations[0].code).toBe("CHAMPION_REQUIRED");
  });

  it("fails when more than 1 champion", () => {
    const violations = championExactlyOne(makeState([makeChampion({ quantity: 2 })]));
    expect(violations).toHaveLength(1);
    expect(violations[0].code).toBe("CHAMPION_TOO_MANY");
  });

  it("fails when champion zone has non-Champion supertype", () => {
    const violations = championExactlyOne(makeState([makeChampion({ superTypes: [] })]));
    expect(violations).toHaveLength(1);
    expect(violations[0].code).toBe("CHAMPION_WRONG_TYPE");
  });
});

// ── championSharesTagWithLegend ─────────────────────────────────────────────

describe("championSharesTagWithLegend", () => {
  it("passes when tags overlap", () => {
    const violations = championSharesTagWithLegend(makeState([makeLegend(), makeChampion()]));
    expect(violations).toEqual([]);
  });

  it("fails when tags do not overlap", () => {
    const violations = championSharesTagWithLegend(
      makeState([makeLegend({ tags: ["Alpha"] }), makeChampion({ tags: ["Beta"] })]),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0].code).toBe("CHAMPION_LEGEND_MISMATCH");
  });

  it("skips when legend or champion is missing", () => {
    expect(championSharesTagWithLegend(makeState([makeLegend()]))).toEqual([]);
    expect(championSharesTagWithLegend(makeState([makeChampion()]))).toEqual([]);
  });
});

// ── runesExactlyTwelve ──────────────────────────────────────────────────────

describe("runesExactlyTwelve", () => {
  it("passes with exactly 12 runes", () => {
    const runes = Array.from({ length: 12 }, (_, index) => makeRune("Fury", `rune-${index}`));
    expect(runesExactlyTwelve(makeState(runes))).toEqual([]);
  });

  it("passes with quantity-based 12", () => {
    const runes = [
      makeCard({ zone: "runes", cardType: "Rune", quantity: 6, cardId: "rune-a" }),
      makeCard({ zone: "runes", cardType: "Rune", quantity: 6, cardId: "rune-b" }),
    ];
    expect(runesExactlyTwelve(makeState(runes))).toEqual([]);
  });

  it("fails with 0 runes", () => {
    const violations = runesExactlyTwelve(makeState([]));
    expect(violations).toHaveLength(1);
    expect(violations[0].code).toBe("RUNES_REQUIRED");
  });

  it("fails with too few runes", () => {
    const runes = Array.from({ length: 8 }, (_, index) => makeRune("Fury", `rune-${index}`));
    const violations = runesExactlyTwelve(makeState(runes));
    expect(violations).toHaveLength(1);
    expect(violations[0].code).toBe("RUNES_TOO_FEW");
  });

  it("fails with too many runes", () => {
    const runes = Array.from({ length: 14 }, (_, index) => makeRune("Fury", `rune-${index}`));
    const violations = runesExactlyTwelve(makeState(runes));
    expect(violations).toHaveLength(1);
    expect(violations[0].code).toBe("RUNES_TOO_MANY");
  });
});

// ── runesAllTypeRune ────────────────────────────────────────────────────────

describe("runesAllTypeRune", () => {
  it("passes when all runes are Rune type", () => {
    expect(runesAllTypeRune(makeState([makeRune("Fury")]))).toEqual([]);
  });

  it("fails when a non-Rune card is in the runes zone", () => {
    const violations = runesAllTypeRune(
      makeState([makeCard({ zone: "runes", cardType: "Spell", cardId: "bad" })]),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0].code).toBe("RUNE_WRONG_TYPE");
    expect(violations[0].cardId).toBe("bad");
  });
});

// ── runesMatchLegendDomains ─────────────────────────────────────────────────

describe("runesMatchLegendDomains", () => {
  it("passes when all rune domains match legend", () => {
    const violations = runesMatchLegendDomains(
      makeState([makeLegend({ domains: ["Fury", "Body"] }), makeRune("Fury"), makeRune("Body")]),
    );
    expect(violations).toEqual([]);
  });

  it("fails when a rune does not match legend domains", () => {
    const violations = runesMatchLegendDomains(
      makeState([
        makeLegend({ domains: ["Fury", "Body"] }),
        makeRune("Fury"),
        makeCard({
          zone: "runes",
          cardType: "Rune",
          domains: ["Mind"],
          cardId: "bad-rune",
          cardName: "Mind Rune",
        }),
      ]),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0].code).toBe("RUNE_DOMAIN_MISMATCH");
    expect(violations[0].cardId).toBe("bad-rune");
  });

  it("skips when no legend is present", () => {
    expect(runesMatchLegendDomains(makeState([makeRune("Fury")]))).toEqual([]);
  });
});

// ── mainDeckExactly ─────────────────────────────────────────────────────────

describe("mainDeckExactly", () => {
  it("passes with exactly 40 cards in main", () => {
    const cards = [makeCard({ quantity: 40 })];
    expect(mainDeckExactly(makeState(cards))).toEqual([]);
  });

  it("passes with 39 main + 1 champion", () => {
    const cards = [makeCard({ quantity: 39 }), makeChampion()];
    expect(mainDeckExactly(makeState(cards))).toEqual([]);
  });

  it("fails with fewer than 40 across main + champion", () => {
    const violations = mainDeckExactly(makeState([makeCard({ quantity: 30 })]));
    expect(violations).toHaveLength(1);
    expect(violations[0].code).toBe("MAIN_TOO_FEW");
  });

  it("fails with more than 40 across main + champion", () => {
    const cards = [makeCard({ quantity: 41 })];
    const violations = mainDeckExactly(makeState(cards));
    expect(violations).toHaveLength(1);
    expect(violations[0].code).toBe("MAIN_TOO_MANY");
  });
});

// ── mainDeckCopyLimit ───────────────────────────────────────────────────────

describe("mainDeckCopyLimit", () => {
  it("passes with 3 copies", () => {
    expect(mainDeckCopyLimit(makeState([makeCard({ quantity: 3 })]))).toEqual([]);
  });

  it("fails with 4 copies", () => {
    const violations = mainDeckCopyLimit(makeState([makeCard({ quantity: 4, cardId: "over" })]));
    expect(violations).toHaveLength(1);
    expect(violations[0].code).toBe("MAIN_COPY_LIMIT");
    expect(violations[0].cardId).toBe("over");
  });
});

// ── championCopyLimitAcrossZones ────────────────────────────────────────────

describe("championCopyLimitAcrossZones", () => {
  it("passes with champion in champion zone and 2 in main", () => {
    const violations = championCopyLimitAcrossZones(
      makeState([makeChampion(), makeCard({ cardId: "champion-1", zone: "main", quantity: 2 })]),
    );
    expect(violations).toEqual([]);
  });

  it("fails with champion in champion zone and 3 in main", () => {
    const violations = championCopyLimitAcrossZones(
      makeState([makeChampion(), makeCard({ cardId: "champion-1", zone: "main", quantity: 3 })]),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0].code).toBe("CHAMPION_COPY_LIMIT");
  });

  it("allows 3 copies in main when card is not the champion", () => {
    const violations = championCopyLimitAcrossZones(
      makeState([makeChampion(), makeCard({ cardId: "other-card", zone: "main", quantity: 3 })]),
    );
    expect(violations).toEqual([]);
  });
});

// ── battlefieldExactlyThree ──────────────────────────────────────────────────

describe("battlefieldExactlyThree", () => {
  it("passes with exactly 3 battlefields", () => {
    const cards = [makeBattlefield("bf-1"), makeBattlefield("bf-2"), makeBattlefield("bf-3")];
    expect(battlefieldExactlyThree(makeState(cards))).toEqual([]);
  });

  it("fails with 0 battlefields", () => {
    const violations = battlefieldExactlyThree(makeState([]));
    expect(violations).toHaveLength(1);
    expect(violations[0].code).toBe("BATTLEFIELD_REQUIRED");
  });

  it("fails with too few", () => {
    const violations = battlefieldExactlyThree(makeState([makeBattlefield("bf-1")]));
    expect(violations).toHaveLength(1);
    expect(violations[0].code).toBe("BATTLEFIELD_TOO_FEW");
  });

  it("fails with too many", () => {
    const cards = [
      makeBattlefield("bf-1"),
      makeBattlefield("bf-2"),
      makeBattlefield("bf-3"),
      makeBattlefield("bf-4"),
    ];
    const violations = battlefieldExactlyThree(makeState(cards));
    expect(violations).toHaveLength(1);
    expect(violations[0].code).toBe("BATTLEFIELD_TOO_MANY");
  });
});

// ── battlefieldAllTypeBattlefield ───────────────────────────────────────────

describe("battlefieldAllTypeBattlefield", () => {
  it("passes when all are Battlefield type", () => {
    expect(battlefieldAllTypeBattlefield(makeState([makeBattlefield("bf-1")]))).toEqual([]);
  });

  it("fails when a non-Battlefield card is in the zone", () => {
    const violations = battlefieldAllTypeBattlefield(
      makeState([makeCard({ zone: "battlefield", cardType: "Spell", cardId: "bad" })]),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0].code).toBe("BATTLEFIELD_WRONG_TYPE");
  });
});

// ── battlefieldNoDuplicates ─────────────────────────────────────────────────

describe("battlefieldNoDuplicates", () => {
  it("passes with unique cards", () => {
    const cards = [makeBattlefield("bf-1"), makeBattlefield("bf-2")];
    expect(battlefieldNoDuplicates(makeState(cards))).toEqual([]);
  });

  it("fails when a card has quantity > 1", () => {
    const violations = battlefieldNoDuplicates(
      makeState([
        makeCard({ zone: "battlefield", cardType: "Battlefield", cardId: "bf-dup", quantity: 2 }),
      ]),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0].code).toBe("BATTLEFIELD_DUPLICATE");
  });
});

// ── sideboardMaximum ────────────────────────────────────────────────────────

describe("sideboardMaximum", () => {
  it("passes with 8 or fewer", () => {
    expect(sideboardMaximum(makeState([makeCard({ zone: "sideboard", quantity: 8 })]))).toEqual([]);
  });

  it("fails with more than 8", () => {
    const violations = sideboardMaximum(makeState([makeCard({ zone: "sideboard", quantity: 9 })]));
    expect(violations).toHaveLength(1);
    expect(violations[0].code).toBe("SIDEBOARD_TOO_MANY");
  });
});

// ── sideboardCopyLimit ──────────────────────────────────────────────────────

describe("sideboardCopyLimit", () => {
  it("passes with 3 copies", () => {
    expect(sideboardCopyLimit(makeState([makeCard({ zone: "sideboard", quantity: 3 })]))).toEqual(
      [],
    );
  });

  it("fails with 4 copies", () => {
    const violations = sideboardCopyLimit(
      makeState([makeCard({ zone: "sideboard", quantity: 4, cardId: "over" })]),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0].code).toBe("SIDEBOARD_COPY_LIMIT");
  });
});

// ── uniqueCopyLimit ─────────────────────────────────────────────────────────

describe("uniqueCopyLimit", () => {
  it("passes for non-Unique cards at 3 copies", () => {
    expect(uniqueCopyLimit(makeState([makeCard({ quantity: 3 })]))).toEqual([]);
  });

  it("passes for a Unique card at 1 copy", () => {
    expect(uniqueCopyLimit(makeState([makeCard({ quantity: 1, keywords: ["Unique"] })]))).toEqual(
      [],
    );
  });

  it("fails for a Unique card with 2 copies in main", () => {
    const violations = uniqueCopyLimit(
      makeState([
        makeCard({ cardId: "uniq-1", cardName: "Lone Wolf", quantity: 2, keywords: ["Unique"] }),
      ]),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0].code).toBe("UNIQUE_COPY_LIMIT");
    expect(violations[0].zone).toBe("main");
    expect(violations[0].cardId).toBe("uniq-1");
  });

  it("fails for a Unique card with 2 copies in sideboard", () => {
    const violations = uniqueCopyLimit(
      makeState([
        makeCard({
          cardId: "uniq-2",
          zone: "sideboard",
          quantity: 2,
          keywords: ["Unique"],
        }),
      ]),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0].code).toBe("UNIQUE_COPY_LIMIT");
    expect(violations[0].zone).toBe("sideboard");
  });

  it("ignores Unique cards in non-main/sideboard zones", () => {
    expect(
      uniqueCopyLimit(
        makeState([makeCard({ zone: "overflow", quantity: 2, keywords: ["Unique"] })]),
      ),
    ).toEqual([]);
  });

  it("flags both main and sideboard copies independently", () => {
    const violations = uniqueCopyLimit(
      makeState([
        makeCard({ cardId: "uniq", quantity: 2, keywords: ["Unique"] }),
        makeCard({ cardId: "uniq", zone: "sideboard", quantity: 2, keywords: ["Unique"] }),
      ]),
    );
    expect(violations).toHaveLength(2);
  });
});

// ── signatureTotalLimit ────────────────────────────────────────────────────

describe("signatureTotalLimit (via validateDeck)", () => {
  const sigViolations = (cards: DeckCard[]) =>
    validateDeck(makeState(cards)).filter((v) => v.code === "SIGNATURE_TOTAL_LIMIT");

  it("passes with 3 or fewer Signature cards", () => {
    const cards = [
      ...makeConstructedShell(),
      makeCard({ cardId: "sig-1", superTypes: ["Signature"], tags: ["FireLord"], quantity: 2 }),
      makeCard({ cardId: "sig-2", superTypes: ["Signature"], tags: ["FireLord"], quantity: 1 }),
      ...Array.from({ length: 11 }, (_, index) =>
        makeCard({ cardId: `filler-${index}`, quantity: 3 }),
      ),
    ];
    expect(sigViolations(cards)).toEqual([]);
  });

  it("passes with no Signature cards", () => {
    const cards = [
      ...makeConstructedShell(),
      ...Array.from({ length: 14 }, (_, index) =>
        makeCard({ cardId: `filler-${index}`, quantity: 3 }),
      ),
    ];
    expect(sigViolations(cards)).toEqual([]);
  });

  it("fails with more than 3 Signature cards across main + sideboard", () => {
    const cards = [
      ...makeConstructedShell(),
      makeCard({
        cardId: "sig-1",
        superTypes: ["Signature"],
        tags: ["FireLord"],
        zone: "main",
        quantity: 2,
      }),
      makeCard({
        cardId: "sig-2",
        superTypes: ["Signature"],
        tags: ["FireLord"],
        zone: "sideboard",
        quantity: 2,
      }),
      ...Array.from({ length: 11 }, (_, index) =>
        makeCard({ cardId: `filler-${index}`, quantity: 3 }),
      ),
    ];
    const violations = sigViolations(cards);
    expect(violations).toHaveLength(1);
    expect(violations[0].code).toBe("SIGNATURE_TOTAL_LIMIT");
    expect(violations[0].zone).toBe("deck");
  });

  it("ignores non-Signature cards when counting", () => {
    const cards = [
      ...makeConstructedShell(),
      makeCard({ cardId: "sig-1", superTypes: ["Signature"], tags: ["FireLord"], quantity: 3 }),
      ...Array.from({ length: 12 }, (_, index) =>
        makeCard({ cardId: `filler-${index}`, quantity: 3 }),
      ),
    ];
    expect(sigViolations(cards)).toEqual([]);
  });
});

// ── signatureMatchesLegendTag ──────────────────────────────────────────────

describe("signatureMatchesLegendTag (via validateDeck)", () => {
  const tagViolations = (cards: DeckCard[]) =>
    validateDeck(makeState(cards)).filter((v) => v.code === "SIGNATURE_TAG_MISMATCH");

  it("passes when Signature cards share a tag with the Legend", () => {
    const cards = [
      ...makeConstructedShell(),
      makeCard({
        cardId: "sig-1",
        superTypes: ["Signature"],
        tags: ["FireLord"],
        cardName: "Fire Sig",
      }),
      ...Array.from({ length: 13 }, (_, index) =>
        makeCard({ cardId: `filler-${index}`, quantity: 3 }),
      ),
    ];
    expect(tagViolations(cards)).toEqual([]);
  });

  it("fails when a Signature card does not share a tag with the Legend", () => {
    const cards = [
      ...makeConstructedShell(),
      makeCard({
        cardId: "sig-1",
        superTypes: ["Signature"],
        tags: ["IceLord"],
        cardName: "Ice Sig",
      }),
      ...Array.from({ length: 13 }, (_, index) =>
        makeCard({ cardId: `filler-${index}`, quantity: 3 }),
      ),
    ];
    const violations = tagViolations(cards);
    expect(violations).toHaveLength(1);
    expect(violations[0].code).toBe("SIGNATURE_TAG_MISMATCH");
    expect(violations[0].cardId).toBe("sig-1");
  });

  it("checks Signature cards in both main and sideboard", () => {
    const cards = [
      ...makeConstructedShell(),
      makeCard({
        cardId: "sig-main",
        zone: "main",
        superTypes: ["Signature"],
        tags: ["IceLord"],
        cardName: "Main Sig",
      }),
      makeCard({
        cardId: "sig-side",
        zone: "sideboard",
        superTypes: ["Signature"],
        tags: ["IceLord"],
        cardName: "Side Sig",
      }),
      ...Array.from({ length: 12 }, (_, index) =>
        makeCard({ cardId: `filler-${index}`, quantity: 3 }),
      ),
    ];
    const violations = tagViolations(cards);
    expect(violations).toHaveLength(2);
    expect(violations[0].zone).toBe("main");
    expect(violations[1].zone).toBe("sideboard");
  });

  it("ignores non-Signature cards", () => {
    const cards = [
      ...makeConstructedShell(),
      makeCard({ cardId: "normal-1", superTypes: [], tags: ["IceLord"] }),
      ...Array.from({ length: 13 }, (_, index) =>
        makeCard({ cardId: `filler-${index}`, quantity: 3 }),
      ),
    ];
    expect(tagViolations(cards)).toEqual([]);
  });

  it("passes when Signature card shares one of multiple tags", () => {
    const cards = [
      makeLegend({ tags: ["FireLord", "DragonKin"] }),
      makeChampion({ tags: ["FireLord"] }),
      ...Array.from({ length: 6 }, (_, index) => makeRune("Fury", `rune-fury-${index}`)),
      ...Array.from({ length: 6 }, (_, index) => makeRune("Body", `rune-body-${index}`)),
      makeBattlefield("bf-1"),
      makeBattlefield("bf-2"),
      makeBattlefield("bf-3"),
      makeCard({
        cardId: "sig-1",
        superTypes: ["Signature"],
        tags: ["DragonKin"],
        cardName: "Dragon Sig",
      }),
      ...Array.from({ length: 13 }, (_, index) =>
        makeCard({ cardId: `filler-${index}`, quantity: 3 }),
      ),
    ];
    expect(tagViolations(cards)).toEqual([]);
  });
});

// ── validateDeck ────────────────────────────────────────────────────────────

describe("validateDeck", () => {
  it("returns no violations for a valid constructed deck", () => {
    const mainCards = Array.from({ length: 13 }, (_, index) =>
      makeCard({ cardId: `main-${index}`, quantity: 3 }),
    );
    const cards = [...makeConstructedShell(), ...mainCards];
    const violations = validateDeck(makeState(cards));
    expect(violations).toEqual([]);
  });

  it("returns empty for freeform regardless of content", () => {
    expect(validateDeck(makeState([], "freeform"))).toEqual([]);
    expect(validateDeck(makeState([makeCard({ quantity: 100 })], "freeform"))).toEqual([]);
  });

  it("returns multiple violations for an empty constructed deck", () => {
    const violations = validateDeck(makeState([]));
    expect(violations.length).toBeGreaterThan(0);

    const codes = violations.map((violation) => violation.code);
    expect(codes).toContain("LEGEND_REQUIRED");
    expect(codes).toContain("CHAMPION_REQUIRED");
    expect(codes).toContain("RUNES_REQUIRED");
    expect(codes).toContain("MAIN_TOO_FEW");
  });

  it("overflow zone cards are ignored by all rules", () => {
    const overflowCard = makeCard({ zone: "overflow", quantity: 999, cardId: "overflow-1" });
    const mainCards = Array.from({ length: 13 }, (_, index) =>
      makeCard({ cardId: `main-${index}`, quantity: 3 }),
    );
    const cards = [...makeConstructedShell(), ...mainCards, overflowCard];
    const violations = validateDeck(makeState(cards));
    expect(violations).toEqual([]);
  });
});

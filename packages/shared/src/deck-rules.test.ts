import { describe, expect, it } from "vitest";

import type { DeckCard, DeckState } from "./deck-rules";
import {
  battlefieldAllTypeBattlefield,
  battlefieldExactlyThree,
  battlefieldNoDuplicates,
  championCopyLimitAcrossZones,
  championExactlyOne,
  championSharesTagWithLegend,
  copyLimitFor,
  formatHasSideboard,
  legendExactlyOne,
  mainDeckCopyLimit,
  mainDeckExactly,
  noBannedCards,
  noTokenCards,
  runesAllTypeRune,
  runesExactlyTwelve,
  runesMatchLegendDomains,
  sideboardCopyLimit,
  sideboardMaximum,
  sideboardNotAllowed,
  UNLIMITED_COPIES,
  uniqueCopyLimit,
  validateDeck,
} from "./deck-rules";

function makeCard(overrides: Partial<DeckCard> = {}): DeckCard {
  const cardType = overrides.cardType ?? overrides.cardTypes?.[0] ?? "unit";
  return {
    cardId: "card-1",
    zone: "main",
    quantity: 1,
    cardName: "Test Card",
    cardType,
    cardTypes: [cardType],
    superTypes: [],
    domains: ["fury"],
    tags: [],
    customTagSlugs: [],
    keywords: [],
    maxCopiesOverride: null,
    banned: false,
    ...overrides,
  };
}

function makeLegend(overrides: Partial<DeckCard> = {}): DeckCard {
  return makeCard({
    cardId: "legend-1",
    zone: "legend",
    cardName: "Fire Lord",
    cardType: "legend",
    domains: ["fury", "body"],
    tags: ["FireLord"],
    ...overrides,
  });
}

function makeChampion(overrides: Partial<DeckCard> = {}): DeckCard {
  return makeCard({
    cardId: "champion-1",
    zone: "champion",
    cardName: "Fire Champion",
    cardType: "unit",
    superTypes: ["champion"],
    domains: ["fury"],
    tags: ["FireLord"],
    ...overrides,
  });
}

function makeRune(domain: "fury" | "body", cardId?: string): DeckCard {
  return makeCard({
    cardId: cardId ?? `rune-${domain.toLowerCase()}-${Math.random().toString(36).slice(2, 6)}`,
    zone: "runes",
    cardName: `${domain} Rune`,
    cardType: "rune",
    domains: [domain],
  });
}

function makeBattlefield(cardId: string): DeckCard {
  return makeCard({
    cardId,
    zone: "battlefield",
    cardName: `Battlefield ${cardId}`,
    cardType: "battlefield",
    domains: [],
  });
}

function makeConstructedShell(): DeckCard[] {
  return [
    makeLegend(),
    makeChampion(),
    ...Array.from({ length: 6 }, (_, index) => makeRune("fury", `rune-fury-${index}`)),
    ...Array.from({ length: 6 }, (_, index) => makeRune("body", `rune-body-${index}`)),
    makeBattlefield("bf-1"),
    makeBattlefield("bf-2"),
    makeBattlefield("bf-3"),
  ];
}

function makeState(
  cards: DeckCard[],
  format: "constructed" | "freeform" | "custom-region" = "constructed",
  formatConfig?: { tagSlugs?: string[] } | null,
  championIdentifierTags?: ReadonlySet<string>,
): DeckState {
  return { format, cards, formatConfig: formatConfig ?? null, championIdentifierTags };
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
    const violations = legendExactlyOne(makeState([makeLegend({ cardType: "unit" })]));
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
    const runes = Array.from({ length: 12 }, (_, index) => makeRune("fury", `rune-${index}`));
    expect(runesExactlyTwelve(makeState(runes))).toEqual([]);
  });

  it("passes with quantity-based 12", () => {
    const runes = [
      makeCard({ zone: "runes", cardType: "rune", quantity: 6, cardId: "rune-a" }),
      makeCard({ zone: "runes", cardType: "rune", quantity: 6, cardId: "rune-b" }),
    ];
    expect(runesExactlyTwelve(makeState(runes))).toEqual([]);
  });

  it("fails with 0 runes", () => {
    const violations = runesExactlyTwelve(makeState([]));
    expect(violations).toHaveLength(1);
    expect(violations[0].code).toBe("RUNES_REQUIRED");
  });

  it("fails with too few runes", () => {
    const runes = Array.from({ length: 8 }, (_, index) => makeRune("fury", `rune-${index}`));
    const violations = runesExactlyTwelve(makeState(runes));
    expect(violations).toHaveLength(1);
    expect(violations[0].code).toBe("RUNES_TOO_FEW");
  });

  it("fails with too many runes", () => {
    const runes = Array.from({ length: 14 }, (_, index) => makeRune("fury", `rune-${index}`));
    const violations = runesExactlyTwelve(makeState(runes));
    expect(violations).toHaveLength(1);
    expect(violations[0].code).toBe("RUNES_TOO_MANY");
  });
});

// ── runesAllTypeRune ────────────────────────────────────────────────────────

describe("runesAllTypeRune", () => {
  it("passes when all runes are Rune type", () => {
    expect(runesAllTypeRune(makeState([makeRune("fury")]))).toEqual([]);
  });

  it("fails when a non-Rune card is in the runes zone", () => {
    const violations = runesAllTypeRune(
      makeState([makeCard({ zone: "runes", cardType: "spell", cardId: "bad" })]),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0].code).toBe("RUNE_WRONG_TYPE");
    expect(violations[0].cardId).toBe("bad");
  });

  it("passes when a multi-type card carries Rune among its types (ADR-037)", () => {
    const card = makeCard({
      zone: "runes",
      cardType: "unit",
      cardTypes: ["unit", "rune"],
      cardId: "dual",
    });
    expect(runesAllTypeRune(makeState([card]))).toEqual([]);
  });
});

// ── runesMatchLegendDomains ─────────────────────────────────────────────────

describe("runesMatchLegendDomains", () => {
  it("passes when all rune domains match legend", () => {
    const violations = runesMatchLegendDomains(
      makeState([makeLegend({ domains: ["fury", "body"] }), makeRune("fury"), makeRune("body")]),
    );
    expect(violations).toEqual([]);
  });

  it("fails when a rune does not match legend domains", () => {
    const violations = runesMatchLegendDomains(
      makeState([
        makeLegend({ domains: ["fury", "body"] }),
        makeRune("fury"),
        makeCard({
          zone: "runes",
          cardType: "rune",
          domains: ["mind"],
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
    expect(runesMatchLegendDomains(makeState([makeRune("fury")]))).toEqual([]);
  });
});

// ── mainDeckExactly ─────────────────────────────────────────────────────────

describe("mainDeckExactly", () => {
  it("passes with exactly 39 cards in main", () => {
    expect(mainDeckExactly(makeState([makeCard({ quantity: 39 })]))).toEqual([]);
  });

  it("passes with 39 main + 1 champion", () => {
    const cards = [makeCard({ quantity: 39 }), makeChampion()];
    expect(mainDeckExactly(makeState(cards))).toEqual([]);
  });

  it("does not flag main when the deck is only missing its champion", () => {
    // The regression: a full 39-card main with no champion used to show a red
    // "39/40 — need 1 more" on a zone that was already complete. The missing
    // champion is CHAMPION_REQUIRED's to report.
    expect(mainDeckExactly(makeState([makeCard({ quantity: 39 })]))).toEqual([]);
  });

  it("ignores champion-zone cards when counting", () => {
    // 39 main + a champion is legal, so a champion must not push main over.
    const cards = [makeCard({ quantity: 39 }), makeChampion({ quantity: 1 })];
    expect(mainDeckExactly(makeState(cards))).toEqual([]);
  });

  it("fails with fewer than 39 in main and counts against 39", () => {
    const violations = mainDeckExactly(makeState([makeCard({ quantity: 36 })]));
    expect(violations).toEqual([
      {
        zone: "main",
        code: "MAIN_TOO_FEW",
        message: "36/39 main-deck cards — need 3 more",
      },
    ]);
  });

  it("fails with more than 39 in main and counts against 39", () => {
    const violations = mainDeckExactly(makeState([makeCard({ quantity: 40 })]));
    expect(violations).toEqual([
      {
        zone: "main",
        code: "MAIN_TOO_MANY",
        message: "40/39 main-deck cards — remove 1",
      },
    ]);
  });
});

// ── copyLimitFor ────────────────────────────────────────────────────────────

describe("copyLimitFor", () => {
  it("defaults to 3 without an override", () => {
    expect(copyLimitFor(makeCard())).toBe(3);
  });

  it("maps the unlimited sentinel to Infinity", () => {
    expect(copyLimitFor(makeCard({ maxCopiesOverride: UNLIMITED_COPIES }))).toBe(
      Number.POSITIVE_INFINITY,
    );
  });

  it("returns a positive override as-is", () => {
    expect(copyLimitFor(makeCard({ maxCopiesOverride: 7 }))).toBe(7);
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

  it("allows any quantity with the unlimited override", () => {
    expect(
      mainDeckCopyLimit(makeState([makeCard({ quantity: 38, maxCopiesOverride: 0 })])),
    ).toEqual([]);
  });

  it("uses a positive override as the limit", () => {
    expect(mainDeckCopyLimit(makeState([makeCard({ quantity: 7, maxCopiesOverride: 7 })]))).toEqual(
      [],
    );
    const violations = mainDeckCopyLimit(
      makeState([makeCard({ quantity: 8, maxCopiesOverride: 7, cardId: "over" })]),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0].code).toBe("MAIN_COPY_LIMIT");
    expect(violations[0].message).toContain("7-copy limit");
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

  it("allows any main quantity when the champion has the unlimited override", () => {
    const violations = championCopyLimitAcrossZones(
      makeState([
        makeChampion(),
        makeCard({ cardId: "champion-1", zone: "main", quantity: 39, maxCopiesOverride: 0 }),
      ]),
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
      makeState([makeCard({ zone: "battlefield", cardType: "spell", cardId: "bad" })]),
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
        makeCard({ zone: "battlefield", cardType: "battlefield", cardId: "bf-dup", quantity: 2 }),
      ]),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0].code).toBe("BATTLEFIELD_DUPLICATE");
  });
});

// ── sideboardMaximum ────────────────────────────────────────────────────────

describe("sideboardMaximum", () => {
  it("passes with 10 or fewer", () => {
    expect(sideboardMaximum(makeState([makeCard({ zone: "sideboard", quantity: 10 })]))).toEqual(
      [],
    );
  });

  it("fails with more than 10", () => {
    const violations = sideboardMaximum(makeState([makeCard({ zone: "sideboard", quantity: 11 })]));
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

  it("allows any quantity with the unlimited override", () => {
    expect(
      sideboardCopyLimit(
        makeState([makeCard({ zone: "sideboard", quantity: 8, maxCopiesOverride: 0 })]),
      ),
    ).toEqual([]);
  });
});

// ── sideboardNotAllowed ─────────────────────────────────────────────────────

describe("sideboardNotAllowed", () => {
  it("passes with an empty sideboard", () => {
    expect(sideboardNotAllowed(makeState([makeCard({ zone: "main" })]))).toEqual([]);
  });

  it("fails with any sideboard card, as a single zone-level violation", () => {
    const violations = sideboardNotAllowed(
      makeState([
        makeCard({ zone: "sideboard", cardId: "side-1" }),
        makeCard({ zone: "sideboard", cardId: "side-2", quantity: 3 }),
      ]),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0].code).toBe("SIDEBOARD_NOT_ALLOWED");
    expect(violations[0].zone).toBe("sideboard");
    expect(violations[0].cardId).toBeUndefined();
  });
});

// ── formatHasSideboard ──────────────────────────────────────────────────────

describe("formatHasSideboard", () => {
  it("is false only for custom-region", () => {
    expect(formatHasSideboard("custom-region")).toBe(false);
    expect(formatHasSideboard("constructed")).toBe(true);
    expect(formatHasSideboard("freeform")).toBe(true);
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
      makeCard({ cardId: "sig-1", superTypes: ["signature"], tags: ["FireLord"], quantity: 2 }),
      makeCard({ cardId: "sig-2", superTypes: ["signature"], tags: ["FireLord"], quantity: 1 }),
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
        superTypes: ["signature"],
        tags: ["FireLord"],
        zone: "main",
        quantity: 2,
      }),
      makeCard({
        cardId: "sig-2",
        superTypes: ["signature"],
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
      makeCard({ cardId: "sig-1", superTypes: ["signature"], tags: ["FireLord"], quantity: 3 }),
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
        superTypes: ["signature"],
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
        superTypes: ["signature"],
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
        superTypes: ["signature"],
        tags: ["IceLord"],
        cardName: "Main Sig",
      }),
      makeCard({
        cardId: "sig-side",
        zone: "sideboard",
        superTypes: ["signature"],
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
      ...Array.from({ length: 6 }, (_, index) => makeRune("fury", `rune-fury-${index}`)),
      ...Array.from({ length: 6 }, (_, index) => makeRune("body", `rune-body-${index}`)),
      makeBattlefield("bf-1"),
      makeBattlefield("bf-2"),
      makeBattlefield("bf-3"),
      makeCard({
        cardId: "sig-1",
        superTypes: ["signature"],
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

describe("noBannedCards", () => {
  it("returns no violations when nothing is banned", () => {
    expect(noBannedCards(makeState([makeCard(), makeLegend()]))).toEqual([]);
  });

  it("flags a banned card with its zone and cardId", () => {
    const violations = noBannedCards(
      makeState([makeCard({ cardId: "bad", cardName: "Forbidden Pact", banned: true })]),
    );

    expect(violations).toEqual([
      {
        zone: "main",
        code: "CARD_BANNED",
        message: "Forbidden Pact is banned.",
        cardId: "bad",
      },
    ]);
  });

  it("emits one violation per banned card", () => {
    const violations = noBannedCards(
      makeState([
        makeCard({ cardId: "bad-1", cardName: "First Ban", banned: true }),
        makeCard({ cardId: "fine", cardName: "Legal Card" }),
        makeCard({ cardId: "bad-2", cardName: "Second Ban", zone: "sideboard", banned: true }),
      ]),
    );

    expect(violations).toHaveLength(2);
    expect(violations.map((violation) => violation.cardId)).toEqual(["bad-1", "bad-2"]);
    expect(violations[1].zone).toBe("sideboard");
  });

  it("ignores a banned card parked in overflow", () => {
    // Overflow is a staging area outside the deck, so parking a banned card
    // there must not make the deck illegal.
    expect(
      noBannedCards(makeState([makeCard({ cardId: "bad", zone: "overflow", banned: true })])),
    ).toEqual([]);
  });
});

describe("noTokenCards", () => {
  function makeToken(overrides: Partial<DeckCard> = {}): DeckCard {
    return makeCard({
      cardId: "token-1",
      cardName: "Sprite",
      superTypes: ["token"],
      ...overrides,
    });
  }

  it("returns no violations for a deck without tokens", () => {
    expect(noTokenCards(makeState([makeCard(), makeLegend()]))).toEqual([]);
  });

  it("flags a token with its zone and cardId", () => {
    expect(noTokenCards(makeState([makeToken()]))).toEqual([
      {
        zone: "main",
        code: "CARD_NOT_DECK_LEGAL",
        message: "Sprite is a Token and can't be part of a deck.",
        cardId: "token-1",
      },
    ]);
  });

  it("emits one violation per token", () => {
    const violations = noTokenCards(
      makeState([
        makeToken({ cardId: "tok-1", cardName: "Sprite" }),
        makeCard({ cardId: "fine", cardName: "Legal Card" }),
        makeToken({ cardId: "tok-2", cardName: "Husk", zone: "sideboard" }),
      ]),
    );

    expect(violations).toHaveLength(2);
    expect(violations.map((violation) => violation.cardId)).toEqual(["tok-1", "tok-2"]);
    expect(violations[1].zone).toBe("sideboard");
  });

  it("ignores a token parked in overflow", () => {
    expect(noTokenCards(makeState([makeToken({ zone: "overflow" })]))).toEqual([]);
  });

  it("leaves other supertypes alone", () => {
    expect(noTokenCards(makeState([makeCard({ superTypes: ["champion", "signature"] })]))).toEqual(
      [],
    );
  });
});

describe("tokens via validateDeck", () => {
  it("makes an otherwise legal constructed deck illegal", () => {
    const mainCards = Array.from({ length: 13 }, (_, index) =>
      makeCard({
        cardId: `main-${index}`,
        quantity: 3,
        superTypes: index === 0 ? ["token"] : [],
      }),
    );
    const violations = validateDeck(makeState([...makeConstructedShell(), ...mainCards]));

    expect(violations).toEqual([
      {
        zone: "main",
        code: "CARD_NOT_DECK_LEGAL",
        message: "Test Card is a Token and can't be part of a deck.",
        cardId: "main-0",
      },
    ]);
  });

  it("enforces the token rule in custom-region", () => {
    const violations = validateDeck(
      makeState(
        [makeCard({ cardId: "tok", superTypes: ["token"], customTagSlugs: ["ionia"] })],
        "custom-region",
        { tagSlugs: ["ionia"] },
      ),
    );

    expect(violations.map((violation) => violation.code)).toContain("CARD_NOT_DECK_LEGAL");
  });

  it("does not enforce the token rule in freeform", () => {
    // Freeform is the deliberate no-rules sandbox: validateDeck short-circuits
    // before any rule runs, so tokens are allowed there like everything else.
    expect(validateDeck(makeState([makeCard({ superTypes: ["token"] })], "freeform"))).toEqual([]);
  });
});

describe("banned cards via validateDeck", () => {
  it("makes an otherwise legal constructed deck illegal", () => {
    const mainCards = Array.from({ length: 13 }, (_, index) =>
      makeCard({ cardId: `main-${index}`, quantity: 3, banned: index === 0 }),
    );
    const violations = validateDeck(makeState([...makeConstructedShell(), ...mainCards]));

    expect(violations).toEqual([
      {
        zone: "main",
        code: "CARD_BANNED",
        message: "Test Card is banned.",
        cardId: "main-0",
      },
    ]);
  });

  it("enforces bans in custom-region", () => {
    const violations = validateDeck(
      makeState(
        [makeCard({ cardId: "bad", banned: true, customTagSlugs: ["ionia"] })],
        "custom-region",
        {
          tagSlugs: ["ionia"],
        },
      ),
    );

    expect(violations.map((violation) => violation.code)).toContain("CARD_BANNED");
  });

  it("does not enforce bans in freeform", () => {
    expect(validateDeck(makeState([makeCard({ banned: true })], "freeform"))).toEqual([]);
  });

  it("emits one violation when a banned card is split across printing rows", () => {
    // Two rows for the same card in one zone collapse before rules run, so a
    // split banned card must not produce duplicate (zone, code, cardId) keys.
    const violations = validateDeck(
      makeState([
        makeCard({ cardId: "bad", quantity: 1, banned: true }),
        makeCard({ cardId: "bad", quantity: 2, banned: true }),
      ]),
    );

    expect(violations.filter((violation) => violation.code === "CARD_BANNED")).toHaveLength(1);
  });
});

describe("validateDeck", () => {
  it("returns no violations for a valid constructed deck", () => {
    const mainCards = Array.from({ length: 13 }, (_, index) =>
      makeCard({ cardId: `main-${index}`, quantity: 3 }),
    );
    const cards = [...makeConstructedShell(), ...mainCards];
    const violations = validateDeck(makeState(cards));
    expect(violations).toEqual([]);
  });

  it("blames only the champion zone when a full main deck has no champion", () => {
    // A complete 39-card main plus a missing champion is one gap, not two: the
    // main zone is finished, so only CHAMPION_REQUIRED should fire.
    const mainCards = Array.from({ length: 13 }, (_, index) =>
      makeCard({ cardId: `main-${index}`, quantity: 3 }),
    );
    const shellWithoutChampion = makeConstructedShell().filter((card) => card.zone !== "champion");
    const codes = validateDeck(makeState([...shellWithoutChampion, ...mainCards])).map(
      (violation) => violation.code,
    );

    expect(codes).toEqual(["CHAMPION_REQUIRED"]);
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

  it("emits one DOMAIN_MISMATCH when an off-domain card is split across printing rows", () => {
    // Two rows for the same card in the same zone (e.g. two pinned printings)
    // must collapse into one violation, not one per row — duplicate
    // (zone, code, cardId) violations produce duplicate React keys downstream.
    const offDomain = { cardId: "off-domain-1", cardName: "Chaos Trick", domains: ["chaos"] };
    const mainCards = [
      ...Array.from({ length: 12 }, (_, index) =>
        makeCard({ cardId: `main-${index}`, quantity: 3 }),
      ),
      makeCard({ ...offDomain, quantity: 2 }),
      makeCard({ ...offDomain, quantity: 1 }),
    ];
    const violations = validateDeck(makeState([...makeConstructedShell(), ...mainCards]));
    const domainMismatches = violations.filter((violation) => violation.code === "DOMAIN_MISMATCH");
    expect(domainMismatches).toHaveLength(1);
    expect(domainMismatches[0].cardId).toBe("off-domain-1");
  });

  it("applies the main-deck copy limit to copies split across printing rows", () => {
    const mainCards = [
      ...Array.from({ length: 12 }, (_, index) =>
        makeCard({ cardId: `main-${index}`, quantity: 3 }),
      ),
      makeCard({ cardId: "split-1", quantity: 2 }),
      makeCard({ cardId: "split-1", quantity: 2 }),
    ];
    const violations = validateDeck(makeState([...makeConstructedShell(), ...mainCards]));
    const copyLimit = violations.filter((violation) => violation.code === "MAIN_COPY_LIMIT");
    expect(copyLimit).toHaveLength(1);
    expect(copyLimit[0].cardId).toBe("split-1");
  });

  it("applies the unique copy limit to copies split across printing rows", () => {
    const unique = { cardId: "unique-1", cardName: "One Of A Kind", keywords: ["Unique"] };
    const mainCards = [
      ...Array.from({ length: 12 }, (_, index) =>
        makeCard({ cardId: `main-${index}`, quantity: 3 }),
      ),
      makeCard({ ...unique, quantity: 1 }),
      makeCard({ ...unique, quantity: 1 }),
      makeCard({ cardId: "filler-1", quantity: 2 }),
    ];
    const violations = validateDeck(makeState([...makeConstructedShell(), ...mainCards]));
    const uniqueViolations = violations.filter(
      (violation) => violation.code === "UNIQUE_COPY_LIMIT",
    );
    expect(uniqueViolations).toHaveLength(1);
    expect(uniqueViolations[0].cardId).toBe("unique-1");
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

// ── validateDeck — custom-region branch ────────────────────────────────────

describe("validateDeck for custom-region", () => {
  function withTags(card: DeckCard, slugs: string[]): DeckCard {
    return { ...card, customTagSlugs: slugs };
  }

  // Custom-region allows exactly 1 battlefield, so drop the constructed
  // shell's second and third one.
  function fullyTaggedShell(slugs: string[]): DeckCard[] {
    return makeConstructedShell()
      .filter((card) => card.zone !== "battlefield" || card.cardId === "bf-1")
      .map((card) => withTags(card, slugs));
  }

  function fullyTaggedMain(slugs: string[], count = 13): DeckCard[] {
    return Array.from({ length: count }, (_, index) =>
      withTags(makeCard({ cardId: `main-${index}`, quantity: 3 }), slugs),
    );
  }

  it("flags empty tag list with FORMAT_TAG_REQUIRED", () => {
    const violations = validateDeck(makeState([], "custom-region", { tagSlugs: [] }));
    const codes = violations.map((v) => v.code);
    expect(codes).toContain("FORMAT_TAG_REQUIRED");
  });

  it("flags missing formatConfig with FORMAT_TAG_REQUIRED", () => {
    const violations = validateDeck(makeState([], "custom-region", null));
    const codes = violations.map((v) => v.code);
    expect(codes).toContain("FORMAT_TAG_REQUIRED");
  });

  it("accepts a fully-tagged 40-card single-region deck", () => {
    const tagSlugs = ["bandle-city"];
    const cards = [...fullyTaggedShell(tagSlugs), ...fullyTaggedMain(tagSlugs)];
    const violations = validateDeck(makeState(cards, "custom-region", { tagSlugs }));
    expect(violations).toEqual([]);
  });

  it("OR-matches across multiple regions — neutral OR bandle-city legal", () => {
    const tagSlugs = ["bandle-city", "neutral"];
    // Mix: half tagged bandle-city, half tagged neutral. Neither carries both.
    const shell = fullyTaggedShell(["bandle-city"]);
    const mainHalf = fullyTaggedMain(["bandle-city"], 6);
    const otherHalf = Array.from({ length: 7 }, (_, index) =>
      withTags(makeCard({ cardId: `neutral-${index}`, quantity: 3 }), ["neutral"]),
    );
    const violations = validateDeck(
      makeState([...shell, ...mainHalf, ...otherHalf], "custom-region", { tagSlugs }),
    );
    expect(violations.filter((v) => v.code === "CARD_NOT_IN_FORMAT_TAG")).toEqual([]);
  });

  it("flags cards carrying none of the chosen tags", () => {
    const tagSlugs = ["bandle-city", "neutral"];
    const cards = [
      ...fullyTaggedShell(["bandle-city"]),
      ...fullyTaggedMain(["bandle-city"], 12),
      withTags(makeCard({ cardId: "wandering-card", quantity: 3 }), ["bilgewater"]),
    ];
    const violations = validateDeck(makeState(cards, "custom-region", { tagSlugs }));
    const offending = violations.filter((v) => v.code === "CARD_NOT_IN_FORMAT_TAG");
    expect(offending).toHaveLength(1);
    expect(offending[0].cardId).toBe("wandering-card");
  });

  it("does not run the dropped domain rules", () => {
    // Main-deck card with a domain outside the legend's domains would fail
    // constructed (DOMAIN_MISMATCH) but pass region-locked.
    const tagSlugs = ["bandle-city"];
    const offColorCard = withTags(
      makeCard({
        cardId: "off-color",
        quantity: 3,
        domains: ["chaos"], // legend uses fury/body
      }),
      tagSlugs,
    );
    const cards = [...fullyTaggedShell(tagSlugs), offColorCard, ...fullyTaggedMain(tagSlugs, 12)];
    const violations = validateDeck(makeState(cards, "custom-region", { tagSlugs }));
    expect(violations.some((v) => v.code === "DOMAIN_MISMATCH")).toBe(false);
    expect(violations.some((v) => v.code === "RUNE_DOMAIN_MISMATCH")).toBe(false);
  });

  it("still runs constructed structural rules (legend/champion/runes/main count)", () => {
    const tagSlugs = ["bandle-city"];
    const violations = validateDeck(makeState([], "custom-region", { tagSlugs }));
    const codes = violations.map((v) => v.code);
    expect(codes).toContain("LEGEND_REQUIRED");
    expect(codes).toContain("CHAMPION_REQUIRED");
    expect(codes).toContain("RUNES_REQUIRED");
    expect(codes).toContain("MAIN_TOO_FEW");
  });

  // ── battlefield exactly 1 (custom-region only) ──────────────────────────

  function shellWithBattlefields(slugs: string[], bfCount: number): DeckCard[] {
    const base = makeConstructedShell()
      .filter((card) => card.zone !== "battlefield")
      .map((card) => ({ ...card, customTagSlugs: slugs }));
    const bfs = Array.from({ length: bfCount }, (_, index) => ({
      ...makeBattlefield(`bf-${index + 1}`),
      customTagSlugs: slugs,
    }));
    return [...base, ...bfs];
  }

  function fullyTaggedMainCards(slugs: string[]): DeckCard[] {
    return Array.from({ length: 13 }, (_, index) => ({
      ...makeCard({ cardId: `main-${index}`, quantity: 3 }),
      customTagSlugs: slugs,
    }));
  }

  it("accepts exactly 1 battlefield", () => {
    const tagSlugs = ["bandle-city"];
    const cards = [...shellWithBattlefields(tagSlugs, 1), ...fullyTaggedMainCards(tagSlugs)];
    const violations = validateDeck(makeState(cards, "custom-region", { tagSlugs }));
    expect(violations.filter((v) => v.code?.startsWith("BATTLEFIELD"))).toEqual([]);
  });

  it("rejects 0 battlefields", () => {
    const tagSlugs = ["bandle-city"];
    const cards = [...shellWithBattlefields(tagSlugs, 0), ...fullyTaggedMainCards(tagSlugs)];
    const violations = validateDeck(makeState(cards, "custom-region", { tagSlugs }));
    expect(violations.some((v) => v.code === "BATTLEFIELD_REQUIRED")).toBe(true);
  });

  it("rejects 2 battlefields", () => {
    const tagSlugs = ["bandle-city"];
    const cards = [...shellWithBattlefields(tagSlugs, 2), ...fullyTaggedMainCards(tagSlugs)];
    const violations = validateDeck(makeState(cards, "custom-region", { tagSlugs }));
    const violation = violations.find((v) => v.code === "BATTLEFIELD_TOO_MANY");
    expect(violation).toBeDefined();
    // The message must spell out the target in plain language, not a bare
    // "2/1" fraction.
    expect(violation?.message).toBe(
      "This format plays exactly 1 Battlefield — remove 1 of the 2 in the deck",
    );
  });

  it("standard constructed still requires exactly 3 battlefields", () => {
    // Constructed rules still use battlefieldExactlyThree — sanity check.
    const cards = [
      makeLegend(),
      makeChampion(),
      ...Array.from({ length: 6 }, (_, index) => makeRune("fury", `rune-fury-${index}`)),
      ...Array.from({ length: 6 }, (_, index) => makeRune("body", `rune-body-${index}`)),
      makeBattlefield("bf-1"),
    ];
    const violations = validateDeck(makeState(cards, "constructed"));
    expect(violations.some((v) => v.code === "BATTLEFIELD_TOO_FEW")).toBe(true);
  });

  // ── no sideboard in custom-region ────────────────────────────────────────

  it("flags any sideboard card with SIDEBOARD_NOT_ALLOWED", () => {
    const tagSlugs = ["bandle-city"];
    const cards = [
      ...fullyTaggedShell(tagSlugs),
      ...fullyTaggedMain(tagSlugs),
      withTags(makeCard({ cardId: "side-1", zone: "sideboard" }), tagSlugs),
    ];
    const violations = validateDeck(makeState(cards, "custom-region", { tagSlugs }));
    expect(violations.some((v) => v.code === "SIDEBOARD_NOT_ALLOWED")).toBe(true);
  });

  it("does not run the sideboard cap rules — the zone is disallowed outright", () => {
    const tagSlugs = ["bandle-city"];
    // 11 copies of one card would trip both SIDEBOARD_TOO_MANY and
    // SIDEBOARD_COPY_LIMIT under constructed rules.
    const cards = [
      ...fullyTaggedShell(tagSlugs),
      ...fullyTaggedMain(tagSlugs),
      withTags(makeCard({ cardId: "side-1", zone: "sideboard", quantity: 11 }), tagSlugs),
    ];
    const violations = validateDeck(makeState(cards, "custom-region", { tagSlugs }));
    const codes = violations.map((v) => v.code);
    expect(codes).toContain("SIDEBOARD_NOT_ALLOWED");
    expect(codes).not.toContain("SIDEBOARD_TOO_MANY");
    expect(codes).not.toContain("SIDEBOARD_COPY_LIMIT");
  });

  it("constructed still allows a legal sideboard", () => {
    const cards = [makeCard({ cardId: "side-1", zone: "sideboard", quantity: 3 })];
    const violations = validateDeck(makeState(cards, "constructed"));
    expect(violations.some((v) => v.code === "SIDEBOARD_NOT_ALLOWED")).toBe(false);
  });

  // ── runes are exempt from the region-tag rule ────────────────────────────

  it("accepts untagged runes — runes carry no region tags", () => {
    const tagSlugs = ["bandle-city"];
    // fullyTaggedShell tags everything; strip the tags off the runes again.
    const cards = [
      ...fullyTaggedShell(tagSlugs).map((card) =>
        card.zone === "runes" ? { ...card, customTagSlugs: [] } : card,
      ),
      ...fullyTaggedMain(tagSlugs),
    ];
    const violations = validateDeck(makeState(cards, "custom-region", { tagSlugs }));
    expect(violations).toEqual([]);
  });

  it("still enforces rune count and type on untagged runes", () => {
    const tagSlugs = ["bandle-city"];
    const cards = [
      ...fullyTaggedShell(tagSlugs).filter((card) => card.zone !== "runes"),
      // Only 11 runes, one of them not a rune card at all.
      ...Array.from({ length: 10 }, (_, index) => makeRune("fury", `rune-fury-${index}`)),
      makeCard({ cardId: "not-a-rune", zone: "runes", cardType: "unit", cardName: "Sneaky Unit" }),
      ...fullyTaggedMain(tagSlugs),
    ];
    const violations = validateDeck(makeState(cards, "custom-region", { tagSlugs }));
    const codes = violations.map((v) => v.code);
    expect(codes).toContain("RUNES_TOO_FEW");
    expect(codes).toContain("RUNE_WRONG_TYPE");
  });

  // ── signatureChampionCopiesInDeck (custom-region only) ──────────────────

  const ALL_CHAMPION_IDS = new Set(["Karma", "Ivern", "Draven", "Garen", "Yasuo"]);

  function customRegionShell(
    legendTag: string,
    championTag: string,
    regionTag: string,
    slugs: string[],
  ): DeckCard[] {
    return [
      { ...makeLegend({ tags: [legendTag] }), customTagSlugs: slugs },
      {
        ...makeChampion({ tags: [championTag, regionTag], cardName: `${championTag}, Hero` }),
        customTagSlugs: slugs,
      },
      ...Array.from({ length: 6 }, (_, index) => ({
        ...makeRune("fury", `rune-fury-${index}`),
        customTagSlugs: slugs,
      })),
      ...Array.from({ length: 6 }, (_, index) => ({
        ...makeRune("body", `rune-body-${index}`),
        customTagSlugs: slugs,
      })),
      { ...makeBattlefield("bf-1"), customTagSlugs: slugs },
    ];
  }

  function makeSignature(
    cardId: string,
    cardName: string,
    tags: string[],
    slugs: string[],
    quantity = 1,
  ): DeckCard {
    return {
      ...makeCard({ cardId, cardName, superTypes: ["signature"], tags, quantity }),
      customTagSlugs: slugs,
    };
  }

  function makeMainChampion(
    cardId: string,
    cardName: string,
    tags: string[],
    slugs: string[],
    quantity = 1,
    zone: DeckCard["zone"] = "main",
  ): DeckCard {
    return {
      ...makeCard({
        cardId,
        zone,
        cardType: "unit",
        superTypes: ["champion"],
        tags,
        cardName,
        quantity,
      }),
      customTagSlugs: slugs,
    };
  }

  function makeFiller(count: number, slugs: string[]): DeckCard[] {
    return Array.from({ length: count }, (_, index) => ({
      ...makeCard({ cardId: `filler-${index}`, quantity: 3 }),
      customTagSlugs: slugs,
    }));
  }

  it("exempts the Legend's own Signatures — no extra champion copies needed", () => {
    const tagSlugs = ["ionia"];
    // Legend = Karma; 3 copies of Karma's Signature backed only by the single
    // Chosen Champion. Exempt because the Signature belongs to the Legend.
    const cards: DeckCard[] = [
      ...customRegionShell("Karma", "Karma", "Ionia", tagSlugs),
      makeSignature("sig-1", "Karma Sig", ["Karma", "Ionia"], tagSlugs, 3),
      ...makeFiller(13, tagSlugs),
    ];
    const violations = validateDeck(
      makeState(cards, "custom-region", { tagSlugs }, ALL_CHAMPION_IDS),
    );
    expect(violations.filter((v) => v.code === "SIGNATURE_CHAMPION_COPIES")).toEqual([]);
  });

  it("rejects a Signature whose champion is not in the deck — region overlap is ignored", () => {
    const tagSlugs = ["ionia"];
    // Chosen Champion = Karma (Ionia). Signature = Daisy! (Ivern + Ionia).
    // Naive tag overlap would pass on "Ionia"; the rule must reject this.
    const cards: DeckCard[] = [
      ...customRegionShell("Karma", "Karma", "Ionia", tagSlugs),
      makeSignature("sig-daisy", "Daisy!", ["Ivern", "Ionia"], tagSlugs),
      ...makeFiller(13, tagSlugs),
    ];
    const violations = validateDeck(
      makeState(cards, "custom-region", { tagSlugs }, ALL_CHAMPION_IDS),
    );
    const offending = violations.filter((v) => v.code === "SIGNATURE_CHAMPION_COPIES");
    expect(offending).toHaveLength(1);
    expect(offending[0].cardId).toBe("sig-daisy");
  });

  it("accepts a Signature when its champion is in the main deck (not Chosen)", () => {
    const tagSlugs = ["ionia"];
    // Chosen = Karma; Ivern is added as a non-Chosen Champion in main.
    const cards: DeckCard[] = [
      ...customRegionShell("Karma", "Karma", "Ionia", tagSlugs),
      makeMainChampion("champion-ivern-main", "Ivern, Green Father", ["Ivern", "Ionia"], tagSlugs),
      makeSignature("sig-daisy", "Daisy!", ["Ivern", "Ionia"], tagSlugs),
      ...makeFiller(12, tagSlugs),
    ];
    const violations = validateDeck(
      makeState(cards, "custom-region", { tagSlugs }, ALL_CHAMPION_IDS),
    );
    expect(violations.filter((v) => v.code === "SIGNATURE_CHAMPION_COPIES")).toEqual([]);
  });

  it("requires one champion copy per Signature copy", () => {
    const tagSlugs = ["ionia"];
    // 3× Daisy! but only 1 Ivern in main — needs 3.
    const cards: DeckCard[] = [
      ...customRegionShell("Karma", "Karma", "Ionia", tagSlugs),
      makeMainChampion("champion-ivern-main", "Ivern, Green Father", ["Ivern", "Ionia"], tagSlugs),
      makeSignature("sig-daisy", "Daisy!", ["Ivern", "Ionia"], tagSlugs, 3),
      ...makeFiller(12, tagSlugs),
    ];
    const violations = validateDeck(
      makeState(cards, "custom-region", { tagSlugs }, ALL_CHAMPION_IDS),
    );
    const offending = violations.filter((v) => v.code === "SIGNATURE_CHAMPION_COPIES");
    expect(offending).toHaveLength(1);
    expect(offending[0].message).toContain("3 copies of Ivern");
    expect(offending[0].message).toContain("found 1");
  });

  it("counts champion copies across different cards of the same champion", () => {
    const tagSlugs = ["ionia"];
    // 3× Daisy! backed by 2 copies of one Ivern card + 1 of another
    // (different printings/variants of the champion all count).
    const cards: DeckCard[] = [
      ...customRegionShell("Karma", "Karma", "Ionia", tagSlugs),
      makeMainChampion("ivern-a", "Ivern, Green Father", ["Ivern", "Ionia"], tagSlugs, 2),
      makeMainChampion("ivern-b", "Ivern, Rootcaller", ["Ivern", "Ionia"], tagSlugs, 1),
      makeSignature("sig-daisy", "Daisy!", ["Ivern", "Ionia"], tagSlugs, 3),
      ...makeFiller(11, tagSlugs),
    ];
    const violations = validateDeck(
      makeState(cards, "custom-region", { tagSlugs }, ALL_CHAMPION_IDS),
    );
    expect(violations.filter((v) => v.code === "SIGNATURE_CHAMPION_COPIES")).toEqual([]);
  });

  it("does not count sideboard champions toward Signature backing", () => {
    const tagSlugs = ["ionia"];
    const cards: DeckCard[] = [
      ...customRegionShell("Karma", "Karma", "Ionia", tagSlugs),
      makeMainChampion(
        "champion-ivern-side",
        "Ivern, Green Father",
        ["Ivern", "Ionia"],
        tagSlugs,
        1,
        "sideboard",
      ),
      makeSignature("sig-daisy", "Daisy!", ["Ivern", "Ionia"], tagSlugs),
      ...makeFiller(13, tagSlugs),
    ];
    const violations = validateDeck(
      makeState(cards, "custom-region", { tagSlugs }, ALL_CHAMPION_IDS),
    );
    const offending = violations.filter((v) => v.code === "SIGNATURE_CHAMPION_COPIES");
    expect(offending).toHaveLength(1);
    expect(offending[0].cardId).toBe("sig-daisy");
  });

  it("sums demand per champion — two Signatures can't share the same copies", () => {
    const tagSlugs = ["ionia"];
    // Two different Ivern Signatures (2 + 1 copies) vs only 2 Iverns.
    const cards: DeckCard[] = [
      ...customRegionShell("Karma", "Karma", "Ionia", tagSlugs),
      makeMainChampion("ivern-a", "Ivern, Green Father", ["Ivern", "Ionia"], tagSlugs, 2),
      makeSignature("sig-daisy", "Daisy!", ["Ivern", "Ionia"], tagSlugs, 2),
      makeSignature("sig-brambles", "Brambles!", ["Ivern", "Ionia"], tagSlugs, 1),
      ...makeFiller(11, tagSlugs),
    ];
    const violations = validateDeck(
      makeState(cards, "custom-region", { tagSlugs }, ALL_CHAMPION_IDS),
    );
    const offending = violations.filter((v) => v.code === "SIGNATURE_CHAMPION_COPIES");
    expect(offending.map((v) => v.cardId).toSorted()).toEqual(["sig-brambles", "sig-daisy"]);
  });

  it("ignores non-champion tags like Equipment on Signatures", () => {
    const tagSlugs = ["noxus"];
    // Spinning Axe = {Draven, Equipment}. Draven is the Legend's champion,
    // so the Signature is exempt; "Equipment" must not confuse the matching.
    const cards: DeckCard[] = [
      ...customRegionShell("Draven", "Draven", "Noxus", tagSlugs),
      makeSignature("sig-axe", "Spinning Axe", ["Draven", "Equipment"], tagSlugs),
      ...makeFiller(13, tagSlugs),
    ];
    const violations = validateDeck(
      makeState(cards, "custom-region", { tagSlugs }, ALL_CHAMPION_IDS),
    );
    expect(violations.filter((v) => v.code === "SIGNATURE_CHAMPION_COPIES")).toEqual([]);
  });

  it("no-ops when championIdentifierTags is not provided (legacy callers)", () => {
    const tagSlugs = ["ionia"];
    const cards: DeckCard[] = [
      ...customRegionShell("Karma", "Karma", "Ionia", tagSlugs),
      makeSignature("sig-daisy", "Daisy!", ["Ivern", "Ionia"], tagSlugs),
      ...makeFiller(13, tagSlugs),
    ];
    // No champion-id set passed → rule must no-op (don't block valid decks
    // just because plumbing isn't there yet).
    const violations = validateDeck(makeState(cards, "custom-region", { tagSlugs }));
    expect(violations.filter((v) => v.code === "SIGNATURE_CHAMPION_COPIES")).toEqual([]);
  });
});

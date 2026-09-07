import type { Printing } from "@openrift/shared/types/catalog";
import { WellKnown } from "@openrift/shared/well-known";
import { describe, expect, it } from "vitest";

import { stubPrinting } from "@/test/factories";

import type { MetaSubmissionDraft } from "./meta-submission-form";
import {
  EMPTY_META_SUBMISSION_DRAFT,
  buildMetaSubmissionInput,
  metaSubmissionDraftFromPrefill,
  metaSubmissionLegendMismatch,
  metaSubmissionListStatus,
  metaSubmissionTextFromCards,
  parseMetaSubmissionList,
  validateMetaSubmissionDraft,
} from "./meta-submission-form";

function catalog(): Printing[] {
  return [
    stubPrinting({
      shortCode: "OGN-001",
      card: { name: "Wandering Ronin", slug: "OGN-001", superTypes: ["legend"], types: ["legend"] },
    }),
    stubPrinting({
      shortCode: "OGN-042",
      card: { name: "Blade of the Exile", slug: "OGN-042" },
    }),
    stubPrinting({
      shortCode: "OGN-077",
      card: { name: "Ionian Cliffside", slug: "OGN-077", types: ["battlefield"] },
    }),
    stubPrinting({
      shortCode: "OGN-090",
      card: { name: "Health Rune", slug: "OGN-090", types: ["rune"] },
    }),
  ];
}

const readyDraft: MetaSubmissionDraft = {
  ...EMPTY_META_SUBMISSION_DRAFT,
  playerName: "Kira",
  rank: "4",
  wins: "5",
  losses: "1",
};

describe("parseMetaSubmissionList", () => {
  it("reads a text list into card lines with their zones", () => {
    const parsed = parseMetaSubmissionList(
      "Legend:\n1 Wandering Ronin\n\nMainDeck:\n3 Blade of the Exile\n",
      catalog(),
    );

    expect(parsed.unmatched).toEqual([]);
    expect(parsed.cards).toEqual([
      { name: "Wandering Ronin", zone: WellKnown.deckZone.LEGEND, quantity: 1 },
      { name: "Blade of the Exile", zone: WellKnown.deckZone.MAIN, quantity: 3 },
    ]);
  });

  it("sums repeated lines of the same card in the same zone", () => {
    const parsed = parseMetaSubmissionList(
      "MainDeck:\n2 Blade of the Exile\n1 Blade of the Exile\n",
      catalog(),
    );

    expect(parsed.cards).toEqual([
      { name: "Blade of the Exile", zone: WellKnown.deckZone.MAIN, quantity: 3 },
    ]);
  });

  it("reports a name the catalog cannot place, and still sends it", () => {
    const parsed = parseMetaSubmissionList(
      "MainDeck:\n3 Blade of the Exile\n2 Definitely Not A Card\n",
      catalog(),
    );

    expect(parsed.unmatched).toEqual(["Definitely Not A Card"]);
    expect(parsed.cards).toContainEqual({
      name: "Definitely Not A Card",
      zone: WellKnown.deckZone.MAIN,
      quantity: 2,
    });
  });

  it("resolves short codes into names, so a deck code can be pasted", () => {
    const parsed = parseMetaSubmissionList("OGN-042 OGN-042 OGN-077", catalog());

    const names = parsed.cards.map((card) => card.name);
    expect(names).toContain("Blade of the Exile");
    expect(names).toContain("Ionian Cliffside");
    expect(parsed.unmatched).toEqual([]);
  });

  it("returns nothing for an empty paste", () => {
    const parsed = parseMetaSubmissionList("   ", catalog());
    expect(parsed.cards).toEqual([]);
    expect(parsed.zones).toEqual({ main: 0, battlefield: 0, runes: 0 });
    expect(parsed.legend).toBeNull();
    expect(parsed.listStatus).toBe("partial");
  });

  it("sums each zone's quantities separately", () => {
    const parsed = parseMetaSubmissionList(
      "MainDeck:\n2 Blade of the Exile\n1 Blade of the Exile\n\nBattlefields:\n1 Ionian Cliffside\n",
      catalog(),
    );

    expect(parsed.zones).toEqual({ main: 3, battlefield: 1, runes: 0 });
  });

  it("resolves the legend from the legend zone", () => {
    const cards = catalog();
    const legendPrinting = cards.find((printing) => printing.shortCode === "OGN-001")!;

    const parsed = parseMetaSubmissionList("Legend:\n1 Wandering Ronin\n", cards);

    expect(parsed.legend).toEqual({
      cardId: legendPrinting.cardId,
      cardName: "Wandering Ronin",
    });
  });

  it("returns no legend when the paste names none", () => {
    const parsed = parseMetaSubmissionList("MainDeck:\n3 Blade of the Exile\n", catalog());
    expect(parsed.legend).toBeNull();
  });

  it("reports a full list when the legend, a battlefield, and a rune are all present", () => {
    const parsed = parseMetaSubmissionList(
      "Legend:\n1 Wandering Ronin\n\nBattlefields:\n1 Ionian Cliffside\n\nRunes:\n1 Health Rune\n",
      catalog(),
    );

    expect(parsed.listStatus).toBe("full");
  });

  it("reports a partial list when the rune zone is missing", () => {
    const parsed = parseMetaSubmissionList(
      "Legend:\n1 Wandering Ronin\n\nBattlefields:\n1 Ionian Cliffside\n",
      catalog(),
    );

    expect(parsed.listStatus).toBe("partial");
  });

  it("reports a partial list when the legend is missing", () => {
    const parsed = parseMetaSubmissionList(
      "Battlefields:\n1 Ionian Cliffside\n\nRunes:\n1 Health Rune\n",
      catalog(),
    );

    expect(parsed.listStatus).toBe("partial");
  });
});

describe("metaSubmissionListStatus", () => {
  const legend = { cardId: "legend-1", cardName: "Wandering Ronin" };

  it("is full when the legend, a battlefield, and a rune are all counted", () => {
    expect(metaSubmissionListStatus({ main: 40, battlefield: 1, runes: 12 }, legend)).toBe("full");
  });

  it("is partial with no legend", () => {
    expect(metaSubmissionListStatus({ main: 40, battlefield: 1, runes: 12 }, null)).toBe("partial");
  });

  it("is partial with no battlefield", () => {
    expect(metaSubmissionListStatus({ main: 40, battlefield: 0, runes: 12 }, legend)).toBe(
      "partial",
    );
  });

  it("is partial with no runes", () => {
    expect(metaSubmissionListStatus({ main: 40, battlefield: 1, runes: 0 }, legend)).toBe(
      "partial",
    );
  });
});

describe("metaSubmissionLegendMismatch", () => {
  it("is false when the parsed legend matches the row's", () => {
    expect(
      metaSubmissionLegendMismatch(
        { legend: { cardId: "legend-1", cardName: "Wandering Ronin" } },
        "legend-1",
      ),
    ).toBe(false);
  });

  it("is true when the parsed legend differs from the row's", () => {
    expect(
      metaSubmissionLegendMismatch(
        { legend: { cardId: "legend-1", cardName: "Wandering Ronin" } },
        "legend-2",
      ),
    ).toBe(true);
  });

  it("is false when the paste has no legend to compare", () => {
    expect(metaSubmissionLegendMismatch({ legend: null }, "legend-1")).toBe(false);
  });

  it("is false when the row has no legend on file", () => {
    expect(
      metaSubmissionLegendMismatch(
        { legend: { cardId: "legend-1", cardName: "Wandering Ronin" } },
        undefined,
      ),
    ).toBe(false);
  });
});

describe("validateMetaSubmissionDraft", () => {
  it("accepts a complete draft against an existing event", () => {
    expect(validateMetaSubmissionDraft(readyDraft, { proposing: false, cardCount: 12 })).toBeNull();
  });

  it("asks for a player name", () => {
    expect(
      validateMetaSubmissionDraft(
        { ...readyDraft, playerName: "  " },
        { proposing: false, cardCount: 12 },
      ),
    ).toMatch(/player/iu);
  });

  it("asks for a decklist when nothing was read", () => {
    expect(validateMetaSubmissionDraft(readyDraft, { proposing: false, cardCount: 0 })).toMatch(
      /decklist/iu,
    );
  });

  it("asks for a finish that is a number", () => {
    expect(
      validateMetaSubmissionDraft(
        { ...readyDraft, rank: "top 8" },
        { proposing: false, cardCount: 12 },
      ),
    ).toMatch(/finish/iu);
  });

  it("refuses a record that is not whole numbers", () => {
    expect(
      validateMetaSubmissionDraft(
        { ...readyDraft, wins: "five" },
        { proposing: false, cardCount: 12 },
      ),
    ).toMatch(/whole numbers/iu);
  });

  it("refuses half a record, which would display as nothing", () => {
    expect(
      validateMetaSubmissionDraft(
        { ...readyDraft, losses: "" },
        { proposing: false, cardCount: 12 },
      ),
    ).toMatch(/both wins and losses/iu);
  });

  it("accepts a draft with no record at all", () => {
    expect(
      validateMetaSubmissionDraft(
        { ...readyDraft, wins: "", losses: "", draws: "" },
        { proposing: false, cardCount: 12 },
      ),
    ).toBeNull();
  });

  it("refuses more lines than the endpoint takes", () => {
    expect(validateMetaSubmissionDraft(readyDraft, { proposing: false, cardCount: 201 })).toMatch(
      /200/u,
    );
  });

  it("ignores the event fields when they are not in play", () => {
    expect(
      validateMetaSubmissionDraft(
        { ...readyDraft, eventName: "", eventDate: "" },
        { proposing: false, cardCount: 12 },
      ),
    ).toBeNull();
  });

  it("accepts a complete proposal", () => {
    expect(
      validateMetaSubmissionDraft(
        {
          ...readyDraft,
          eventName: "Summoner Skirmish",
          eventDate: "2026-08-15",
          eventFormat: "standard",
          eventPlayerCount: "64",
        },
        { proposing: true, cardCount: 12 },
      ),
    ).toBeNull();
  });

  it("asks for the tournament's name, day, and format when proposing", () => {
    const base = { ...readyDraft, eventDate: "2026-08-15", eventFormat: "standard" };
    expect(
      validateMetaSubmissionDraft({ ...base, eventName: "" }, { proposing: true, cardCount: 4 }),
    ).toMatch(/name/iu);
    expect(
      validateMetaSubmissionDraft(
        { ...base, eventName: "Summoner Skirmish", eventDate: "15 August" },
        { proposing: true, cardCount: 4 },
      ),
    ).toMatch(/day/iu);
    expect(
      validateMetaSubmissionDraft(
        { ...base, eventName: "Summoner Skirmish", eventFormat: "" },
        { proposing: true, cardCount: 4 },
      ),
    ).toMatch(/format/iu);
  });

  it("refuses a player count that is not a whole number", () => {
    expect(
      validateMetaSubmissionDraft(
        {
          ...readyDraft,
          eventName: "Summoner Skirmish",
          eventDate: "2026-08-15",
          eventFormat: "standard",
          eventPlayerCount: "sixty four",
        },
        { proposing: true, cardCount: 4 },
      ),
    ).toMatch(/players/iu);
  });
});

describe("buildMetaSubmissionInput", () => {
  const cards = [{ name: "Blade of the Exile", zone: WellKnown.deckZone.MAIN, quantity: 3 }];

  it("targets an existing event and proposes nothing", () => {
    const input = buildMetaSubmissionInput(
      readyDraft,
      { cards, listStatus: "partial" },
      { metaEventId: "event-1" },
    );

    expect(input.metaEventId).toBe("event-1");
    expect(input.proposedEvent).toBeNull();
    expect(input.playerName).toBe("Kira");
    expect(input.rank).toBe(4);
    expect(input.rankIsTier).toBe(false);
    expect(input.wins).toBe(5);
    expect(input.losses).toBe(1);
    expect(input.cards).toEqual(cards);
    expect(input.listStatus).toBe("partial");
  });

  it("carries the parsed list's status through to the request", () => {
    const input = buildMetaSubmissionInput(
      readyDraft,
      { cards, listStatus: "full" },
      { metaEventId: "event-1" },
    );

    expect(input.listStatus).toBe("full");
  });

  it("proposes an event and targets none", () => {
    const input = buildMetaSubmissionInput(
      {
        ...readyDraft,
        eventName: "  Summoner Skirmish  ",
        eventDate: "2026-08-15",
        eventFormat: "standard",
        eventPlayerCount: "64",
        eventOrganizer: "Rift Games Berlin",
        eventSourceUrl: "https://example.test/results",
      },
      { cards, listStatus: "partial" },
      null,
    );

    expect(input.metaEventId).toBeNull();
    expect(input.proposedEvent).toEqual({
      name: "Summoner Skirmish",
      eventDate: "2026-08-15",
      format: "standard",
      playerCount: 64,
      organizer: "Rift Games Berlin",
      sourceUrl: "https://example.test/results",
    });
  });

  it("sends a bracket-only finish as a tier", () => {
    const input = buildMetaSubmissionInput(
      { ...readyDraft, rankIsTier: true },
      { cards, listStatus: "partial" },
      { metaEventId: "event-1" },
    );

    expect(input.rank).toBe(4);
    expect(input.rankIsTier).toBe(true);
  });

  it("sends the optional fields as null rather than empty strings", () => {
    const input = buildMetaSubmissionInput(
      {
        ...readyDraft,
        wins: "",
        losses: "",
        draws: "",
        note: "",
        eventName: "Summoner Skirmish",
        eventDate: "2026-08-15",
        eventFormat: "standard",
      },
      { cards, listStatus: "partial" },
      null,
    );

    expect(input.wins).toBeNull();
    expect(input.losses).toBeNull();
    expect(input.draws).toBeNull();
    expect(input.note).toBeNull();
    expect(input.proposedEvent?.playerCount).toBeNull();
    expect(input.proposedEvent?.organizer).toBeNull();
    expect(input.proposedEvent?.sourceUrl).toBeNull();
  });
});

describe("metaSubmissionDraftFromPrefill", () => {
  it("carries a standings row into the form so only the list is left to type", () => {
    const draft = metaSubmissionDraftFromPrefill({
      playerName: "M. Álvarez",
      rank: 4,
      rankIsTier: false,
      wins: 12,
      losses: 2,
      draws: 1,
    });

    expect(draft.playerName).toBe("M. Álvarez");
    expect(draft.rank).toBe("4");
    expect(draft.rankIsTier).toBe(false);
    expect(draft.wins).toBe("12");
    expect(draft.losses).toBe("2");
    expect(draft.draws).toBe("1");
    expect(draft.deckText).toBe("");
  });

  it("keeps a cut bucket a cut bucket", () => {
    expect(metaSubmissionDraftFromPrefill({ rank: 8, rankIsTier: true }).rankIsTier).toBe(true);
  });

  it("leaves the record blank when the source published none", () => {
    const draft = metaSubmissionDraftFromPrefill({ playerName: "Ana", rank: 12 });
    expect(draft.wins).toBe("");
    expect(draft.losses).toBe("");
    expect(draft.draws).toBe("");
  });

  it("prints a zero count rather than reading it as nothing published", () => {
    const draft = metaSubmissionDraftFromPrefill({ wins: 5, losses: 0, draws: 0 });
    expect(draft.losses).toBe("0");
    expect(draft.draws).toBe("0");
  });

  it("drops a rank the form would reject rather than blocking the send", () => {
    expect(metaSubmissionDraftFromPrefill({ rank: 0 }).rank).toBe(EMPTY_META_SUBMISSION_DRAFT.rank);
    expect(metaSubmissionDraftFromPrefill({ rank: -3 }).rank).toBe(
      EMPTY_META_SUBMISSION_DRAFT.rank,
    );
  });

  it("returns a blank form when nothing was passed", () => {
    expect(metaSubmissionDraftFromPrefill({})).toEqual(EMPTY_META_SUBMISSION_DRAFT);
  });
});

describe("metaSubmissionDraftFromPrefill kinds", () => {
  it("opens a completion holding the archive's own list", () => {
    const draft = metaSubmissionDraftFromPrefill({
      kind: "completion",
      deckText: "MainDeck:\n3 Blade of the Exile",
    });

    expect(draft.kind).toBe("completion");
    expect(draft.deckText).toBe("MainDeck:\n3 Blade of the Exile");
  });
});

describe("metaSubmissionTextFromCards", () => {
  it("writes the archive's list back in the format the paste box reads", () => {
    const text = metaSubmissionTextFromCards([
      { cardName: "Wandering Ronin", quantity: 1, zone: WellKnown.deckZone.LEGEND },
      { cardName: "Blade of the Exile", quantity: 3, zone: WellKnown.deckZone.MAIN },
    ]);

    expect(text).toBe("Legend:\n1 Wandering Ronin\n\nMainDeck:\n3 Blade of the Exile");
  });

  it("round-trips through the parser the form uses on the way back", () => {
    const text = metaSubmissionTextFromCards([
      { cardName: "Blade of the Exile", quantity: 3, zone: WellKnown.deckZone.MAIN },
    ]);
    const parsed = parseMetaSubmissionList(text, catalog());

    expect(parsed.unmatched).toEqual([]);
    expect(parsed.cards).toEqual([
      { name: "Blade of the Exile", zone: WellKnown.deckZone.MAIN, quantity: 3 },
    ]);
  });

  it("writes nothing for a deck the archive holds no cards of", () => {
    expect(metaSubmissionTextFromCards([])).toBe("");
  });
});

describe("kinds on the way out", () => {
  it("refuses a correction that says nothing about what is wrong", () => {
    const draft: MetaSubmissionDraft = { ...readyDraft, kind: "correction", note: "  " };
    expect(validateMetaSubmissionDraft(draft, { proposing: false, cardCount: 40 })).toContain(
      "what's wrong",
    );
  });

  it("accepts a correction that explains itself", () => {
    const draft: MetaSubmissionDraft = {
      ...readyDraft,
      kind: "correction",
      note: "The stream VOD shows four Blades, not three.",
    };
    expect(validateMetaSubmissionDraft(draft, { proposing: false, cardCount: 40 })).toBeNull();
  });

  it("sends the kind the link asked for", () => {
    const input = buildMetaSubmissionInput(
      { ...readyDraft, kind: "completion" },
      {
        cards: [{ name: "Blade of the Exile", zone: WellKnown.deckZone.MAIN, quantity: 3 }],
        listStatus: "partial",
      },
      { metaEventId: "event-1" },
    );
    expect(input.kind).toBe("completion");
  });

  it("falls back to a new list when the tournament itself is being proposed", () => {
    const input = buildMetaSubmissionInput(
      {
        ...readyDraft,
        kind: "correction",
        eventName: "Summoner Skirmish",
        eventDate: "2026-08-15",
        eventFormat: "freeform",
      },
      {
        cards: [{ name: "Blade of the Exile", zone: WellKnown.deckZone.MAIN, quantity: 3 }],
        listStatus: "partial",
      },
      null,
    );
    expect(input.kind).toBe("new_list");
  });
});

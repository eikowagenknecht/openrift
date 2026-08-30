import type { Printing } from "@openrift/shared";
import { WellKnown } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import { stubPrinting } from "@/test/factories";

import type { MetaSubmissionDraft } from "./meta-submission-form";
import {
  EMPTY_META_SUBMISSION_DRAFT,
  buildMetaSubmissionInput,
  metaSubmissionDraftFromPrefill,
  parseMetaSubmissionList,
  validateMetaSubmissionDraft,
} from "./meta-submission-form";

/** @returns A catalog big enough to resolve the lists these tests paste. */
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
    // The line still travels: the server's alias index may know a spelling this
    // one does not, and if it does not either, it comes back as unresolved.
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
    expect(parseMetaSubmissionList("   ", catalog()).cards).toEqual([]);
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
    const input = buildMetaSubmissionInput(readyDraft, cards, { metaEventId: "event-1" });

    expect(input.metaEventId).toBe("event-1");
    expect(input.proposedEvent).toBeNull();
    expect(input.playerName).toBe("Kira");
    expect(input.rank).toBe(4);
    expect(input.rankIsTier).toBe(false);
    expect(input.wins).toBe(5);
    expect(input.losses).toBe(1);
    expect(input.cards).toEqual(cards);
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
      cards,
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
    const input = buildMetaSubmissionInput({ ...readyDraft, rankIsTier: true }, cards, {
      metaEventId: "event-1",
    });

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
      cards,
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

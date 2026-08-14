import type { AdminMetaDeck, AdminMetaEvent } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import {
  EMPTY_META_EVENT_DRAFT,
  metaDeckArchetypeCards,
  metaDeckFinishTier,
  metaDeckToDraft,
  metaEventDraftToBody,
  metaEventToDraft,
  summarizeDeckCards,
  validateMetaDeckDraft,
  validateMetaEventDraft,
} from "@/lib/admin-meta-draft";
import type { MetaDeckDraft, MetaEventDraft } from "@/lib/admin-meta-draft";

function eventDraft(overrides: Partial<MetaEventDraft> = {}): MetaEventDraft {
  return {
    ...EMPTY_META_EVENT_DRAFT,
    slug: "summoner-skirmish-2026",
    name: "Summoner Skirmish 2026",
    eventDate: "2026-08-14",
    format: "standard",
    ...overrides,
  };
}

function deckDraft(overrides: Partial<MetaDeckDraft> = {}): MetaDeckDraft {
  return {
    name: "Yasuo Aggro",
    format: "standard",
    playerName: "Rell Enjoyer",
    finishTier: "1",
    record: "5-1",
    listStatus: "full",
    legendCardId: null,
    championCardId: null,
    ...overrides,
  };
}

describe("validateMetaEventDraft", () => {
  it("accepts a complete draft", () => {
    expect(validateMetaEventDraft(eventDraft())).toBeNull();
  });

  it("accepts a draft with every optional field filled", () => {
    const draft = eventDraft({
      playerCount: "128",
      organizer: "LGS Berlin",
      sourceUrl: "https://example.invalid/results",
      notes: "Top cut only.",
    });
    expect(validateMetaEventDraft(draft)).toBeNull();
  });

  it("rejects a slug that is too short", () => {
    expect(validateMetaEventDraft(eventDraft({ slug: "ab" }))).toMatch(/slug/iu);
  });

  it("rejects a slug with uppercase or spaces", () => {
    expect(validateMetaEventDraft(eventDraft({ slug: "Summoner Skirmish" }))).toMatch(/slug/iu);
  });

  it("rejects a slug starting with a hyphen", () => {
    expect(validateMetaEventDraft(eventDraft({ slug: "-open" }))).toMatch(/slug/iu);
  });

  it("rejects each reserved slug", () => {
    for (const slug of ["decks", "events", "stats", "admin"]) {
      expect(validateMetaEventDraft(eventDraft({ slug }))).toMatch(/reserved/iu);
    }
  });

  it("rejects an empty name", () => {
    expect(validateMetaEventDraft(eventDraft({ name: "   " }))).toMatch(/name/iu);
  });

  it("rejects a name over 120 characters", () => {
    expect(validateMetaEventDraft(eventDraft({ name: "x".repeat(121) }))).toMatch(/name/iu);
  });

  it("rejects a non-ISO date", () => {
    expect(validateMetaEventDraft(eventDraft({ eventDate: "14.08.2026" }))).toMatch(/date/iu);
  });

  it("rejects a missing format", () => {
    expect(validateMetaEventDraft(eventDraft({ format: "" }))).toMatch(/format/iu);
  });

  it("rejects a non-numeric player count", () => {
    expect(validateMetaEventDraft(eventDraft({ playerCount: "many" }))).toMatch(/player count/iu);
  });

  it("rejects a player count of zero", () => {
    expect(validateMetaEventDraft(eventDraft({ playerCount: "0" }))).toMatch(/player count/iu);
  });

  it("accepts a blank player count", () => {
    expect(validateMetaEventDraft(eventDraft({ playerCount: "" }))).toBeNull();
  });

  it("rejects notes over 4000 characters", () => {
    expect(validateMetaEventDraft(eventDraft({ notes: "n".repeat(4001) }))).toMatch(/notes/iu);
  });
});

describe("metaEventDraftToBody", () => {
  it("trims the required fields", () => {
    const body = metaEventDraftToBody(eventDraft({ name: "  Skirmish  ", slug: " open-2026 " }));
    expect(body.name).toBe("Skirmish");
    expect(body.slug).toBe("open-2026");
  });

  it("sends blank optional fields as null so an edit can clear them", () => {
    const body = metaEventDraftToBody(eventDraft());
    expect(body.playerCount).toBeNull();
    expect(body.organizer).toBeNull();
    expect(body.sourceUrl).toBeNull();
    expect(body.notes).toBeNull();
  });

  it("parses the player count as a number", () => {
    expect(metaEventDraftToBody(eventDraft({ playerCount: " 64 " })).playerCount).toBe(64);
  });
});

describe("metaEventToDraft", () => {
  it("round-trips through the body builder", () => {
    const event: AdminMetaEvent = {
      id: "3f2a",
      slug: "open-2026",
      name: "Runeterra Open",
      eventDate: "2026-08-14",
      format: "standard",
      playerCount: 96,
      organizer: "Riot Games",
      sourceUrl: "https://example.invalid/vod",
      notes: "Swiss into top 8.",
      deckCount: 8,
    };
    const body = metaEventDraftToBody(metaEventToDraft(event));
    expect(body).toEqual({
      slug: "open-2026",
      name: "Runeterra Open",
      eventDate: "2026-08-14",
      format: "standard",
      playerCount: 96,
      organizer: "Riot Games",
      sourceUrl: "https://example.invalid/vod",
      notes: "Swiss into top 8.",
    });
  });

  it("turns null columns into empty fields", () => {
    const event: AdminMetaEvent = {
      id: "3f2a",
      slug: "open-2026",
      name: "Runeterra Open",
      eventDate: "2026-08-14",
      format: "standard",
      playerCount: null,
      organizer: null,
      sourceUrl: null,
      notes: null,
      deckCount: 0,
    };
    const draft = metaEventToDraft(event);
    expect(draft.playerCount).toBe("");
    expect(draft.organizer).toBe("");
    expect(draft.sourceUrl).toBe("");
    expect(draft.notes).toBe("");
  });
});

describe("metaDeckFinishTier", () => {
  it("reads a whole number", () => {
    expect(metaDeckFinishTier("8")).toBe(8);
  });

  it("tolerates surrounding whitespace", () => {
    expect(metaDeckFinishTier(" 16 ")).toBe(16);
  });

  it("accepts the bounds", () => {
    expect(metaDeckFinishTier("1")).toBe(1);
    expect(metaDeckFinishTier("1024")).toBe(1024);
  });

  it("rejects values outside the bounds", () => {
    expect(metaDeckFinishTier("0")).toBeNull();
    expect(metaDeckFinishTier("1025")).toBe(1025);
  });

  it("rejects non-integers and empty input", () => {
    expect(metaDeckFinishTier("1.5")).toBeNull();
    expect(metaDeckFinishTier("first")).toBeNull();
    expect(metaDeckFinishTier("")).toBeNull();
  });
});

describe("validateMetaDeckDraft", () => {
  it("accepts a complete draft", () => {
    expect(validateMetaDeckDraft(deckDraft())).toBeNull();
  });

  it("accepts a blank record", () => {
    expect(validateMetaDeckDraft(deckDraft({ record: "" }))).toBeNull();
  });

  it("rejects an empty deck name", () => {
    expect(validateMetaDeckDraft(deckDraft({ name: " " }))).toMatch(/deck name/iu);
  });

  it("rejects a deck name over 200 characters", () => {
    expect(validateMetaDeckDraft(deckDraft({ name: "x".repeat(201) }))).toMatch(/deck name/iu);
  });

  it("rejects an empty player name", () => {
    expect(validateMetaDeckDraft(deckDraft({ playerName: "" }))).toMatch(/player name/iu);
  });

  it("rejects a player name over 80 characters", () => {
    expect(validateMetaDeckDraft(deckDraft({ playerName: "p".repeat(81) }))).toMatch(
      /player name/iu,
    );
  });

  it("rejects an out-of-range finish", () => {
    expect(validateMetaDeckDraft(deckDraft({ finishTier: "0" }))).toMatch(/finish/iu);
  });

  it("rejects a record over 20 characters", () => {
    expect(validateMetaDeckDraft(deckDraft({ record: "1".repeat(21) }))).toMatch(/record/iu);
  });

  it("rejects a new archetype entry with no legend picked", () => {
    expect(validateMetaDeckDraft(deckDraft({ listStatus: "archetype" }))).toMatch(/legend/iu);
  });

  it("accepts an archetype entry once its legend is picked", () => {
    expect(
      validateMetaDeckDraft(deckDraft({ listStatus: "archetype", legendCardId: "legend-1" })),
    ).toBeNull();
  });

  it("lets an edit keep the stored legend without re-picking it", () => {
    expect(validateMetaDeckDraft(deckDraft({ listStatus: "archetype" }), false)).toBeNull();
  });

  it("asks for no legend on a partial list, whose main deck is pasted", () => {
    expect(validateMetaDeckDraft(deckDraft({ listStatus: "partial" }))).toBeNull();
  });
});

describe("metaDeckArchetypeCards", () => {
  it("builds a single legend row when no champion was named", () => {
    expect(metaDeckArchetypeCards(deckDraft({ legendCardId: "legend-1" }))).toEqual([
      { cardId: "legend-1", zone: "legend", quantity: 1, preferredPrintingId: null },
    ]);
  });

  it("adds the champion row when one was picked", () => {
    expect(
      metaDeckArchetypeCards(deckDraft({ legendCardId: "legend-1", championCardId: "champ-1" })),
    ).toEqual([
      { cardId: "legend-1", zone: "legend", quantity: 1, preferredPrintingId: null },
      { cardId: "champ-1", zone: "champion", quantity: 1, preferredPrintingId: null },
    ]);
  });

  it("builds nothing without a legend, so an edit keeps the stored rows", () => {
    expect(metaDeckArchetypeCards(deckDraft({ championCardId: "champ-1" }))).toEqual([]);
  });
});

describe("metaDeckToDraft", () => {
  const stored: AdminMetaDeck = {
    deckId: "d1",
    shareToken: "abc123def456",
    listStatus: "full",
    name: "Yasuo Aggro",
    format: "standard",
    playerName: "Rell Enjoyer",
    finishTier: 4,
    record: null,
    cardCount: 40,
  };

  it("loads a stored deck into the form", () => {
    expect(metaDeckToDraft(stored)).toEqual({
      name: "Yasuo Aggro",
      format: "standard",
      playerName: "Rell Enjoyer",
      finishTier: "4",
      record: "",
      listStatus: "full",
      legendCardId: null,
      championCardId: null,
    });
  });

  it("keeps the stored status and leaves the card picks empty", () => {
    const draft = metaDeckToDraft({ ...stored, shareToken: null, listStatus: "archetype" });
    expect(draft.listStatus).toBe("archetype");
    expect(draft.legendCardId).toBeNull();
  });
});

describe("summarizeDeckCards", () => {
  it("counts rows and copies", () => {
    const summary = summarizeDeckCards([
      { cardId: "a", zone: "main", quantity: 3, preferredPrintingId: null },
      { cardId: "b", zone: "main", quantity: 2, preferredPrintingId: null },
      { cardId: "c", zone: "legend", quantity: 1, preferredPrintingId: null },
    ]);
    expect(summary).toEqual({ rows: 3, copies: 6 });
  });

  it("reports zero for an empty list", () => {
    expect(summarizeDeckCards([])).toEqual({ rows: 0, copies: 0 });
  });
});

import type { AdminMetaEvent, AdminMetaPlayer } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import {
  EMPTY_META_EVENT_DRAFT,
  metaEventDraftToBody,
  metaEventOverlayEdits,
  metaEventToDraft,
  metaPlayerDeckRename,
  metaPlayerOverlayFields,
  metaPlayerOverlayList,
  metaPlayerRank,
  metaPlayerRecordPart,
  metaPlayerToDraft,
  summarizeDeckCards,
  validateMetaEventDraft,
  validateMetaPlayerDraft,
} from "@/lib/admin-meta-draft";
import type { MetaEventDraft, MetaPlayerDraft } from "@/lib/admin-meta-draft";
import type { ImportedDeckCard } from "@/lib/deck-import-cards";

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

function playerDraft(overrides: Partial<MetaPlayerDraft> = {}): MetaPlayerDraft {
  return {
    playerName: "Rell Enjoyer",
    rank: "1",
    rankIsTier: false,
    wins: "5",
    losses: "1",
    draws: "",
    legendCardId: null,
    championCardId: null,
    listStatus: "full",
    deckName: "Yasuo Aggro",
    deckFormat: "standard",
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
    for (const slug of ["decks", "events", "legends", "stats", "submissions", "submit", "admin"]) {
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
      notes: "Swiss into top 8.",
      tier: "competitive",
      country: "DE",
      location: "Kartenstraße 1, 10115 Berlin, DE",
      playerRowCount: 64,
      deckCount: 8,
      sources: [],
    };
    const body = metaEventDraftToBody(metaEventToDraft(event));
    expect(body).toEqual({
      slug: "open-2026",
      name: "Runeterra Open",
      eventDate: "2026-08-14",
      format: "standard",
      playerCount: 96,
      organizer: "Riot Games",
      notes: "Swiss into top 8.",
      tier: "competitive",
      country: "DE",
      location: "Kartenstraße 1, 10115 Berlin, DE",
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
      notes: null,
      tier: "local",
      country: null,
      location: null,
      playerRowCount: 0,
      deckCount: 0,
      sources: [],
    };
    const draft = metaEventToDraft(event);
    expect(draft.playerCount).toBe("");
    expect(draft.organizer).toBe("");
    expect(draft.notes).toBe("");
  });
});

describe("metaEventOverlayEdits", () => {
  function storedEvent(overrides: Partial<AdminMetaEvent> = {}): AdminMetaEvent {
    return {
      id: "3f2a",
      slug: "open-2026",
      name: "Runeterra Open",
      eventDate: "2026-08-14",
      format: "standard",
      playerCount: 96,
      organizer: "Riot Games",
      notes: null,
      tier: "competitive",
      country: "DE",
      location: null,
      playerRowCount: 64,
      deckCount: 8,
      sources: [],
      ...overrides,
    };
  }

  it("claims nothing when the form saved what was already there", () => {
    const event = storedEvent();
    expect(metaEventOverlayEdits(event, metaEventDraftToBody(metaEventToDraft(event)))).toEqual([]);
  });

  it("claims only the fields that moved", () => {
    const event = storedEvent();
    const body = metaEventDraftToBody(
      metaEventToDraft({ ...event, name: "Runeterra Open 2026", playerCount: 128 }),
    );

    expect(metaEventOverlayEdits(event, body)).toEqual([
      { field: "name", value: "Runeterra Open 2026" },
      { field: "playerCount", value: "128" },
    ]);
  });

  it("sends null for a field the form cleared, which is what the mask expresses", () => {
    const event = storedEvent();
    const body = metaEventDraftToBody(metaEventToDraft({ ...event, organizer: null }));

    expect(metaEventOverlayEdits(event, body)).toEqual([{ field: "organizer", value: null }]);
  });

  it("leaves the slug out, since no source publishes one", () => {
    const event = storedEvent();
    const body = metaEventDraftToBody(metaEventToDraft({ ...event, slug: "open-2027" }));

    expect(metaEventOverlayEdits(event, body)).toEqual([]);
  });

  it("claims a field the archive never held", () => {
    const event = storedEvent();
    const body = metaEventDraftToBody(metaEventToDraft({ ...event, notes: "Swiss into top 8." }));

    expect(metaEventOverlayEdits(event, body)).toEqual([
      { field: "notes", value: "Swiss into top 8." },
    ]);
  });
});

describe("metaPlayerRank", () => {
  it("reads a whole number", () => {
    expect(metaPlayerRank("8")).toBe(8);
  });

  it("tolerates surrounding whitespace", () => {
    expect(metaPlayerRank(" 16 ")).toBe(16);
  });

  it("accepts any positive rank, however deep the field", () => {
    expect(metaPlayerRank("1")).toBe(1);
    expect(metaPlayerRank("1024")).toBe(1024);
  });

  it("rejects zero, non-integers, and empty input", () => {
    expect(metaPlayerRank("0")).toBeNull();
    expect(metaPlayerRank("1.5")).toBeNull();
    expect(metaPlayerRank("first")).toBeNull();
    expect(metaPlayerRank("")).toBeNull();
  });
});

describe("metaPlayerRecordPart", () => {
  it("reads a number, and a blank box as null", () => {
    expect(metaPlayerRecordPart("5")).toBe(5);
    expect(metaPlayerRecordPart("0")).toBe(0);
    expect(metaPlayerRecordPart("  ")).toBeNull();
  });
});

describe("validateMetaPlayerDraft", () => {
  it("accepts a complete draft", () => {
    expect(validateMetaPlayerDraft(playerDraft())).toBeNull();
  });

  it("rejects an empty player name", () => {
    expect(validateMetaPlayerDraft(playerDraft({ playerName: "" }))).toMatch(/player name/iu);
  });

  it("rejects a player name over 80 characters", () => {
    expect(validateMetaPlayerDraft(playerDraft({ playerName: "p".repeat(81) }))).toMatch(
      /player name/iu,
    );
  });

  it("rejects an out-of-range finish", () => {
    expect(validateMetaPlayerDraft(playerDraft({ rank: "0" }))).toMatch(/finish/iu);
  });

  it("rejects a record that is not whole numbers", () => {
    expect(validateMetaPlayerDraft(playerDraft({ wins: "five" }))).toMatch(/whole numbers/iu);
  });

  it("rejects half a record, which would display as nothing", () => {
    expect(validateMetaPlayerDraft(playerDraft({ losses: "" }))).toMatch(/both wins and losses/iu);
  });

  it("accepts a standings-only row with no record and no deck fields", () => {
    expect(
      validateMetaPlayerDraft(
        playerDraft({
          listStatus: "none",
          wins: "",
          losses: "",
          deckName: "",
          deckFormat: "",
        }),
      ),
    ).toBeNull();
  });

  it("asks for the deck name and format once a list is claimed", () => {
    expect(validateMetaPlayerDraft(playerDraft({ deckName: " " }))).toMatch(/deck name/iu);
    expect(validateMetaPlayerDraft(playerDraft({ deckFormat: "" }))).toMatch(/format/iu);
  });
});

describe("metaPlayerToDraft", () => {
  const stored: AdminMetaPlayer = {
    id: "p1",
    rank: 4,
    rankIsTier: true,
    playerName: "Rell Enjoyer",
    wins: 5,
    losses: 1,
    draws: null,
    legendCardId: "legend-1",
    legendName: "Yasuo",
    championCardId: null,
    championName: null,
    listStatus: "full",
    deckId: "d1",
    shareToken: "abc123def456",
    deckName: "Yasuo Aggro",
    deckFormat: "standard",
    cardCount: 40,
    claimedFields: [],
  };

  it("loads a stored standings row into the form", () => {
    expect(metaPlayerToDraft(stored, "legacy")).toEqual({
      playerName: "Rell Enjoyer",
      rank: "4",
      rankIsTier: true,
      wins: "5",
      losses: "1",
      draws: "",
      legendCardId: "legend-1",
      championCardId: null,
      listStatus: "full",
      deckName: "Yasuo Aggro",
      deckFormat: "standard",
    });
  });

  it("falls back to the event format for a row with no deck", () => {
    const draft = metaPlayerToDraft(
      {
        ...stored,
        listStatus: "none",
        deckId: null,
        shareToken: null,
        deckName: null,
        deckFormat: null,
        cardCount: 0,
      },
      "legacy",
    );
    expect(draft.listStatus).toBe("none");
    expect(draft.deckName).toBe("");
    expect(draft.deckFormat).toBe("legacy");
  });

  it("keeps the legend, which a standings-only row is filed under", () => {
    expect(metaPlayerToDraft(stored, "legacy").legendCardId).toBe("legend-1");
  });
});

describe("metaPlayerOverlayFields", () => {
  const stored: AdminMetaPlayer = {
    id: "p1",
    rank: 4,
    rankIsTier: true,
    playerName: "Rell Enjoyer",
    wins: 5,
    losses: 1,
    draws: null,
    legendCardId: "legend-1",
    legendName: "Yasuo",
    championCardId: null,
    championName: null,
    listStatus: "full",
    deckId: "d1",
    shareToken: "abc123def456",
    deckName: "Yasuo Aggro",
    deckFormat: "standard",
    cardCount: 40,
    claimedFields: [],
  };

  function draftFor(overrides: Partial<MetaPlayerDraft> = {}): MetaPlayerDraft {
    return { ...metaPlayerToDraft(stored, "standard"), ...overrides };
  }

  it("claims nothing when the form saved what was already there", () => {
    expect(metaPlayerOverlayFields(stored, draftFor())).toEqual({});
  });

  it("claims only the fields that moved", () => {
    expect(metaPlayerOverlayFields(stored, draftFor({ rank: "2", wins: "6" }))).toEqual({
      rank: 2,
      wins: 6,
    });
  });

  it("sends null for a record box the form emptied", () => {
    expect(metaPlayerOverlayFields(stored, draftFor({ losses: "" }))).toEqual({ losses: null });
  });

  it("claims a cleared legend as null rather than leaving it to the source", () => {
    expect(metaPlayerOverlayFields(stored, draftFor({ legendCardId: null }))).toEqual({
      legendCardId: null,
    });
  });

  it("trims the name before deciding whether it moved", () => {
    expect(metaPlayerOverlayFields(stored, draftFor({ playerName: "  Rell Enjoyer  " }))).toEqual(
      {},
    );
  });

  it("skips a rank the form would have refused anyway", () => {
    expect(metaPlayerOverlayFields(stored, draftFor({ rank: "abc" }))).toEqual({});
  });

  it("claims the bracket flag on its own", () => {
    expect(metaPlayerOverlayFields(stored, draftFor({ rankIsTier: false }))).toEqual({
      rankIsTier: false,
    });
  });
});

describe("metaPlayerOverlayList", () => {
  const withList: AdminMetaPlayer = {
    id: "p1",
    rank: 1,
    rankIsTier: false,
    playerName: "Rell Enjoyer",
    wins: null,
    losses: null,
    draws: null,
    legendCardId: null,
    legendName: null,
    championCardId: null,
    championName: null,
    listStatus: "full",
    deckId: "d1",
    shareToken: "abc123def456",
    deckName: "Yasuo Aggro",
    deckFormat: "standard",
    cardCount: 40,
    claimedFields: [],
  };
  const deckless: AdminMetaPlayer = {
    ...withList,
    listStatus: "none",
    deckId: null,
    shareToken: null,
    deckName: null,
    deckFormat: null,
    cardCount: 0,
  };
  const cards: ImportedDeckCard[] = [
    { cardId: "c1", zone: "main", quantity: 3, preferredPrintingId: null },
  ];

  function draftFor(player: AdminMetaPlayer, overrides: Partial<MetaPlayerDraft> = {}) {
    return { ...metaPlayerToDraft(player, "standard"), ...overrides };
  }

  it("says nothing about a deck the edit did not touch", () => {
    expect(metaPlayerOverlayList(withList, draftFor(withList), [])).toBeUndefined();
  });

  it("says nothing when a deckless row stays deckless", () => {
    expect(metaPlayerOverlayList(deckless, draftFor(deckless), [])).toBeUndefined();
  });

  it("claims that there is no list when a stored deck is dropped", () => {
    expect(
      metaPlayerOverlayList(withList, draftFor(withList, { listStatus: "none" }), []),
    ).toBeNull();
  });

  it("claims the pasted cards, without a format the event already owns", () => {
    expect(metaPlayerOverlayList(withList, draftFor(withList), cards)).toEqual({
      name: "Yasuo Aggro",
      cards,
      listStatus: "full",
    });
  });

  it("carries a partial claim through as partial", () => {
    expect(
      metaPlayerOverlayList(withList, draftFor(withList, { listStatus: "partial" }), cards)
        ?.listStatus,
    ).toBe("partial");
  });

  it("attaches a first list to a row that had none", () => {
    const draft = draftFor(deckless, { listStatus: "full", deckName: "Yasuo Aggro" });

    expect(metaPlayerOverlayList(deckless, draft, cards)).toEqual({
      name: "Yasuo Aggro",
      cards,
      listStatus: "full",
    });
  });
});

describe("metaPlayerDeckRename", () => {
  const withList: AdminMetaPlayer = {
    id: "p1",
    rank: 1,
    rankIsTier: false,
    playerName: "Rell Enjoyer",
    wins: null,
    losses: null,
    draws: null,
    legendCardId: null,
    legendName: null,
    championCardId: null,
    championName: null,
    listStatus: "full",
    deckId: "d1",
    shareToken: "abc123def456",
    deckName: "Yasuo Aggro",
    deckFormat: "standard",
    cardCount: 40,
    claimedFields: [],
  };
  const deckless: AdminMetaPlayer = {
    ...withList,
    listStatus: "none",
    deckId: null,
    shareToken: null,
    deckName: null,
    deckFormat: null,
    cardCount: 0,
  };
  const cards: ImportedDeckCard[] = [
    { cardId: "c1", zone: "main", quantity: 3, preferredPrintingId: null },
  ];

  function draftFor(player: AdminMetaPlayer, overrides: Partial<MetaPlayerDraft> = {}) {
    return { ...metaPlayerToDraft(player, "standard"), ...overrides };
  }

  it("renames a stored deck the form retitled", () => {
    const draft = draftFor(withList, { deckName: "Yasuo Midrange" });

    expect(metaPlayerDeckRename(withList, draft, [])).toBe("Yasuo Midrange");
  });

  it("renames nothing when the title did not move", () => {
    expect(metaPlayerDeckRename(withList, draftFor(withList), [])).toBeNull();
  });

  it("ignores whitespace either side of an unchanged title", () => {
    const draft = draftFor(withList, { deckName: "  Yasuo Aggro  " });

    expect(metaPlayerDeckRename(withList, draft, [])).toBeNull();
  });

  it("leaves a pasted list to carry its own name, so it is not sent twice", () => {
    const draft = draftFor(withList, { deckName: "Yasuo Midrange" });

    expect(metaPlayerDeckRename(withList, draft, cards)).toBeNull();
  });

  it("renames nothing on a row with no deck to rename", () => {
    const draft = draftFor(deckless, { listStatus: "full", deckName: "Yasuo Aggro" });

    expect(metaPlayerDeckRename(deckless, draft, [])).toBeNull();
  });

  it("renames nothing while the same save is dropping the deck", () => {
    const draft = draftFor(withList, { listStatus: "none", deckName: "Yasuo Midrange" });

    expect(metaPlayerDeckRename(withList, draft, [])).toBeNull();
  });

  it("refuses to blank a deck's name", () => {
    expect(metaPlayerDeckRename(withList, draftFor(withList, { deckName: "  " }), [])).toBeNull();
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

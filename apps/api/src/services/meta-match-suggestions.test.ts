import { describe, expect, it } from "vitest";

import type { AdminMetaDeckRow, MetaEventWithCount } from "../repositories/meta.js";
import {
  MAX_EVENT_MATCH_DAY_DELTA,
  nameSimilarity,
  rankDeckMatches,
  rankEventMatches,
  scoreDeckMatch,
  scoreEventMatch,
} from "./meta-match-suggestions.js";

/** @returns A live event row with the fields the ranking reads. */
function event(overrides: Partial<MetaEventWithCount> = {}): MetaEventWithCount {
  return {
    id: "3f7a1c2e-0000-7000-8000-000000000001",
    slug: "summoner-skirmish-berlin",
    name: "Summoner Skirmish Berlin",
    eventDate: "2026-08-01",
    format: "constructed",
    playerCount: 64,
    organizer: "LGS Berlin",
    notes: null,
    createdAt: new Date("2026-08-02T10:00:00.000Z"),
    updatedAt: new Date("2026-08-02T10:00:00.000Z"),
    deckCount: 8,
    ...overrides,
  };
}

/** @returns An archived deck row with the fields the ranking reads. */
function deck(overrides: Partial<AdminMetaDeckRow> = {}): AdminMetaDeckRow {
  return {
    deckId: "3f7a1c2e-0000-7000-8000-00000000000d",
    shareToken: "aB3dE5gH7jK9",
    listStatus: "full",
    name: "Jinx Aggro",
    format: "constructed",
    playerName: "Nova",
    finishTier: 1,
    record: "5-1",
    cardCount: 40,
    ...overrides,
  };
}

const CANDIDATE = {
  name: "Summoner Skirmish Berlin",
  eventDate: "2026-08-01",
  format: "constructed",
};

describe("nameSimilarity", () => {
  it("reads two spellings of one name as identical", () => {
    expect(nameSimilarity("Summoner Skirmish #4", "summoner skirmish 4")).toBe(1);
  });

  it("scores a partial overlap between zero and one", () => {
    const score = nameSimilarity("Summoner Skirmish Berlin", "Summoner Skirmish Berlin Open");
    expect(score).toBeGreaterThan(0.5);
    expect(score).toBeLessThan(1);
  });

  it("finds nothing shared between unrelated names", () => {
    expect(nameSimilarity("Piltover Open", "Zaun Invitational")).toBeLessThan(0.3);
  });

  it("returns zero when either name normalizes to nothing", () => {
    expect(nameSimilarity("???", "Summoner Skirmish")).toBe(0);
    expect(nameSimilarity("", "")).toBe(0);
  });
});

describe("scoreEventMatch", () => {
  it("adds all three signals for the same tournament", () => {
    const { score, reasons } = scoreEventMatch(CANDIDATE, event());
    expect(score).toBe(10);
    expect(reasons).toEqual(["same format", "same date", "same name"]);
  });

  it("still credits a date one day off, one point lower", () => {
    const { score, reasons, withinWindow } = scoreEventMatch(
      CANDIDATE,
      event({ eventDate: "2026-08-02" }),
    );
    expect(score).toBe(9);
    expect(reasons).toContain("1 day apart");
    expect(withinWindow).toBe(true);
  });

  it("keeps a two-day gap inside the window: sources file a weekend differently", () => {
    const { score, reasons, withinWindow } = scoreEventMatch(
      CANDIDATE,
      event({ eventDate: "2026-08-03" }),
    );
    expect(withinWindow).toBe(true);
    expect(score).toBe(9);
    expect(reasons).toContain("2 days apart");
  });

  it("keeps the far edge of the window", () => {
    const { withinWindow, reasons } = scoreEventMatch(
      CANDIDATE,
      event({ eventDate: `2026-08-0${1 + MAX_EVENT_MATCH_DAY_DELTA}` }),
    );
    expect(withinWindow).toBe(true);
    expect(reasons).toContain(`${MAX_EVENT_MATCH_DAY_DELTA} days apart`);
  });

  it("drops the date signal four days out, past the window", () => {
    const { reasons, withinWindow } = scoreEventMatch(
      CANDIDATE,
      event({ eventDate: "2026-08-05" }),
    );
    expect(withinWindow).toBe(false);
    expect(reasons).toEqual(["same format", "same name"]);
  });

  it("gives no signal for a different format", () => {
    const { reasons } = scoreEventMatch(CANDIDATE, event({ format: "freeform" }));
    expect(reasons).not.toContain("same format");
  });

  it("survives an unparseable date instead of throwing", () => {
    const { reasons } = scoreEventMatch(CANDIDATE, event({ eventDate: "not-a-date" }));
    expect(reasons).toEqual(["same format", "same name"]);
  });
});

describe("rankEventMatches", () => {
  it("puts the best match first", () => {
    const ranked = rankEventMatches(CANDIDATE, [
      event({ id: "weak", slug: "other", name: "Summoner Skirmish Berlin", format: "freeform" }),
      event({ id: "strong" }),
    ]);
    expect(ranked[0].metaEventId).toBe("strong");
  });

  it("offers nothing for a name that only coincides with a different season", () => {
    // Same recurring series, wrong year and wrong format: name alone must not
    // carry a suggestion.
    const ranked = rankEventMatches(CANDIDATE, [
      event({ eventDate: "2025-08-01", format: "freeform" }),
    ]);
    expect(ranked).toEqual([]);
  });

  it("links the two halves of a weekend a source filed under different days", () => {
    const ranked = rankEventMatches(
      { name: "Summoner Skirmish Berlin", eventDate: "2026-08-07", format: "constructed" },
      [event({ eventDate: "2026-08-09" })],
    );
    expect(ranked).toHaveLength(1);
    expect(ranked[0].reasons).toContain("2 days apart");
  });

  it("still refuses the next weekend's event", () => {
    const ranked = rankEventMatches(
      { name: "Summoner Skirmish Berlin", eventDate: "2026-08-07", format: "constructed" },
      [event({ eventDate: "2026-08-14" })],
    );
    expect(ranked).toEqual([]);
  });

  it("caps the list so it stays a hint rather than a search", () => {
    const events = Array.from({ length: 8 }, (_, index) =>
      event({ id: `evt-${index}`, slug: `slug-${index}` }),
    );
    expect(rankEventMatches(CANDIDATE, events)).toHaveLength(5);
  });

  it("returns nothing for an empty archive", () => {
    expect(rankEventMatches(CANDIDATE, [])).toEqual([]);
  });
});

describe("scoreDeckMatch", () => {
  it("treats the same pilot as the whole signal", () => {
    const { score, reasons } = scoreDeckMatch(
      { playerName: "nova", finishTier: 4 },
      deck({ finishTier: 4 }),
    );
    expect(score).toBe(11);
    expect(reasons).toEqual(["same player", "same finish"]);
  });

  it("prefers an equal finish only as a tie-break", () => {
    const same = scoreDeckMatch({ playerName: "Nova", finishTier: 1 }, deck());
    const different = scoreDeckMatch({ playerName: "Nova", finishTier: 8 }, deck());
    expect(same.score - different.score).toBe(1);
  });

  it("still ranks a near-miss spelling below an exact one", () => {
    const near = scoreDeckMatch({ playerName: "Novaa", finishTier: 1 }, deck());
    expect(near.score).toBeGreaterThan(0);
    expect(near.score).toBeLessThan(10);
  });
});

describe("rankDeckMatches", () => {
  it("orders by pilot, best first", () => {
    const ranked = rankDeckMatches({ playerName: "Nova", finishTier: 1 }, [
      deck({ deckId: "other", playerName: "Novaa" }),
      deck({ deckId: "exact", playerName: "Nova" }),
    ]);
    expect(ranked.map((row) => row.deckId)).toEqual(["exact", "other"]);
  });

  it("offers nothing when no pilot name overlaps", () => {
    expect(
      rankDeckMatches({ playerName: "Nova", finishTier: 1 }, [deck({ playerName: "Ekko" })]),
    ).toEqual([]);
  });

  it("returns nothing for an event with no decks yet", () => {
    expect(rankDeckMatches({ playerName: "Nova", finishTier: 1 }, [])).toEqual([]);
  });
});

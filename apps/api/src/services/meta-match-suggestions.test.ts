import { describe, expect, it, vi } from "vitest";

import type { Repos } from "../deps.js";
import type { AdminMetaPlayerRow, MetaEventWithCounts } from "../repositories/meta.js";
import {
  MAX_EVENT_MATCH_DAY_DELTA,
  nameSimilarity,
  rankEventMatches,
  rankPlayerMatches,
  scoreEventMatch,
  scorePlayerMatch,
  suggestMetaEventMatches,
} from "./meta-match-suggestions.js";

/** @returns A live event row with the fields the ranking reads. */
function event(overrides: Partial<MetaEventWithCounts> = {}): MetaEventWithCounts {
  return {
    id: "3f7a1c2e-0000-7000-8000-000000000001",
    slug: "summoner-skirmish-berlin",
    name: "Summoner Skirmish Berlin",
    eventDate: "2026-08-01",
    format: "constructed",
    playerCount: 64,
    organizer: "LGS Berlin",
    notes: null,
    tier: "store",
    country: "DE",
    location: null,
    createdAt: new Date("2026-08-02T10:00:00.000Z"),
    updatedAt: new Date("2026-08-02T10:00:00.000Z"),
    playerRowCount: 64,
    deckCount: 8,
    ...overrides,
  };
}

/** @returns A live standings row with the fields the ranking reads. */
function player(overrides: Partial<AdminMetaPlayerRow> = {}): AdminMetaPlayerRow {
  return {
    id: "3f7a1c2e-0000-7000-8000-00000000000p",
    rank: 1,
    rankIsTier: false,
    playerName: "Nova",
    wins: 5,
    losses: 1,
    draws: 0,
    legendCardId: "card-azir",
    legendName: "Azir",
    legendSlug: "azir",
    legendTypes: ["legend"],
    legendTags: [],
    legendDomains: ["order"],
    championCardId: null,
    championName: null,
    championSlug: null,
    championDomains: null,
    deckId: "3f7a1c2e-0000-7000-8000-00000000000d",
    deckName: "Jinx Aggro",
    shareToken: "aB3dE5gH7jK9",
    listStatus: "full",
    deckFormat: "constructed",
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

  it("carries the size of the standings the admin would be linking into", () => {
    const ranked = rankEventMatches(CANDIDATE, [event({ playerRowCount: 64, deckCount: 8 })]);
    expect(ranked[0].playerRowCount).toBe(64);
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

describe("scorePlayerMatch", () => {
  it("treats the same player as the whole signal", () => {
    const { score, reasons } = scorePlayerMatch(
      { playerName: "nova", rank: 4 },
      player({ rank: 4 }),
    );
    expect(score).toBe(11);
    expect(reasons).toEqual(["same player", "same finish"]);
  });

  it("prefers an equal rank only as a tie-break", () => {
    const same = scorePlayerMatch({ playerName: "Nova", rank: 1 }, player());
    const different = scorePlayerMatch({ playerName: "Nova", rank: 8 }, player());
    expect(same.score - different.score).toBe(1);
  });

  it("still ranks a near-miss spelling below an exact one", () => {
    const near = scorePlayerMatch({ playerName: "Novaa", rank: 1 }, player());
    expect(near.score).toBeGreaterThan(0);
    expect(near.score).toBeLessThan(10);
  });

  it("does not match on the finish alone, which a whole cut bucket shares", () => {
    const { score, playerMatched } = scorePlayerMatch(
      { playerName: "Ekko", rank: 1 },
      player({ playerName: "Nova", rank: 1 }),
    );
    expect(playerMatched).toBe(false);
    expect(score).toBe(1);
  });
});

describe("rankPlayerMatches", () => {
  it("orders by player, best first", () => {
    const ranked = rankPlayerMatches({ playerName: "Nova", rank: 1 }, [
      player({ id: "other", playerName: "Novaa" }),
      player({ id: "exact", playerName: "Nova" }),
    ]);
    expect(ranked.map((row) => row.metaEventPlayerId)).toEqual(["exact", "other"]);
  });

  it("offers a standings-only row, which most of a field is", () => {
    const ranked = rankPlayerMatches({ playerName: "Nova", rank: 1 }, [
      player({ deckId: null, deckName: null, shareToken: null, listStatus: "none" }),
    ]);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].deckId).toBeNull();
  });

  it("carries the rank and its tier flag, so the admin sees what they link into", () => {
    const ranked = rankPlayerMatches({ playerName: "Nova", rank: 8 }, [
      player({ rank: 8, rankIsTier: true }),
    ]);
    expect(ranked[0]).toMatchObject({ rank: 8, rankIsTier: true });
  });

  it("offers nothing when no player name overlaps", () => {
    expect(
      rankPlayerMatches({ playerName: "Nova", rank: 1 }, [player({ playerName: "Ekko" })]),
    ).toEqual([]);
  });

  it("returns nothing for an event with no standings yet", () => {
    expect(rankPlayerMatches({ playerName: "Nova", rank: 1 }, [])).toEqual([]);
  });
});

describe("suggestMetaEventMatches", () => {
  const CANDIDATE_ID = "3f7a1c2e-0000-7000-8000-0000000000ca";

  function repos(candidate: Record<string, unknown> | undefined, rows: MetaEventWithCounts[] = []) {
    const listEvents = vi.fn().mockResolvedValue({ rows, total: rows.length });
    const eventById = vi.fn().mockResolvedValue(candidate);
    return {
      repos: { meta: { listEvents }, metaCandidates: { eventById } } as unknown as Repos,
      listEvents,
    };
  }

  const candidate = {
    id: CANDIDATE_ID,
    metaEventId: null,
    name: "Summoner Skirmish Berlin",
    eventDate: "2026-08-01",
    format: "constructed",
  };

  it("reads only the events the date window could score, never the whole archive", async () => {
    const { repos: r, listEvents } = repos(candidate);

    await suggestMetaEventMatches(r, CANDIDATE_ID);

    expect(listEvents).toHaveBeenCalledWith(
      { dateFrom: "2026-07-29", dateTo: "2026-08-04" },
      expect.objectContaining({ offset: 0 }),
    );
  });

  it("ranks only what the window returned, so an out-of-window twin cannot be offered", async () => {
    const { repos: r } = repos(candidate, [
      event({ name: "Summoner Skirmish Berlin", eventDate: "2026-08-01" }),
    ]);

    const suggestions = await suggestMetaEventMatches(r, CANDIDATE_ID);

    expect(suggestions.map((row) => row.name)).toEqual(["Summoner Skirmish Berlin"]);
  });

  it("suggests nothing for a candidate that is already linked, without querying at all", async () => {
    const { repos: r, listEvents } = repos({ ...candidate, metaEventId: "live-1" });

    expect(await suggestMetaEventMatches(r, CANDIDATE_ID)).toEqual([]);
    expect(listEvents).not.toHaveBeenCalled();
  });

  it("suggests nothing for a candidate id that resolves to no row", async () => {
    const { repos: r, listEvents } = repos(undefined);

    expect(await suggestMetaEventMatches(r, CANDIDATE_ID)).toEqual([]);
    expect(listEvents).not.toHaveBeenCalled();
  });
});

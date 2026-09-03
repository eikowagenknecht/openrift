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
  suggestMetaPlayerMatches,
  summarizePlayerMatch,
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
    sourceIdentity: null,
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

  it("calls a match exact only when name, date and format all agree", () => {
    expect(scoreEventMatch(CANDIDATE, event()).isExact).toBe(true);
    expect(scoreEventMatch(CANDIDATE, event({ eventDate: "2026-08-02" })).isExact).toBe(false);
    expect(scoreEventMatch(CANDIDATE, event({ format: "freeform" })).isExact).toBe(false);
    expect(scoreEventMatch(CANDIDATE, event({ name: "Summoner Skirmish 2" })).isExact).toBe(false);
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

  it("never offers the event an upload already sits on, which is not a move", () => {
    const ranked = rankEventMatches(
      CANDIDATE,
      [event({ id: "current" }), event({ id: "other" })],
      "current",
    );
    expect(ranked.map((row) => row.metaEventId)).toEqual(["other"]);
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

  it("calls the same name exact whatever the finish says, since sources disagree on placings", () => {
    expect(scorePlayerMatch({ playerName: "nova", rank: 9 }, player()).isExact).toBe(true);
    expect(scorePlayerMatch({ playerName: "Novaa", rank: 1 }, player()).isExact).toBe(false);
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

  it("qualifies a row on the finish alone, the only signal a renaming source leaves", () => {
    const { score, playerMatched, rankMatched } = scorePlayerMatch(
      { playerName: "Ekko", rank: 1 },
      player({ playerName: "Nova", rank: 1 }),
    );
    expect({ playerMatched, rankMatched }).toEqual({ playerMatched: false, rankMatched: true });
    expect(score).toBe(1);
  });

  it("never calls a shared finish exact, since a cut bucket shares one", () => {
    expect(
      scorePlayerMatch({ playerName: "Ekko", rank: 1 }, player({ playerName: "Nova", rank: 1 }))
        .isExact,
    ).toBe(false);
  });

  it("keeps the faintest name overlap above a finish-only row", () => {
    const faint = scorePlayerMatch(
      { playerName: "Nova", rank: 9 },
      player({ playerName: "Vayne" }),
    );
    const finish = scorePlayerMatch({ playerName: "Ekko", rank: 1 }, player());
    expect(faint.playerMatched).toBe(true);
    expect(faint.score).toBeGreaterThan(finish.score);
  });
});

describe("rankPlayerMatches", () => {
  it("orders by player, best first", () => {
    const ranked = rankPlayerMatches({ playerName: "Nova", rank: 1 }, [
      player({ id: "finish", playerName: "Ekko", rank: 1 }),
      player({ id: "exact", playerName: "Nova", rank: 6 }),
    ]);
    expect(ranked.map((row) => row.metaEventPlayerId)).toEqual(["exact", "finish"]);
  });

  it("shortlists one row per signal, leaving the rest to the picker", () => {
    const ranked = rankPlayerMatches({ playerName: "Nova", rank: 1 }, [
      player({ id: "exact", playerName: "Nova", rank: 1 }),
      player({ id: "near", playerName: "Novaa", rank: 2 }),
      player({ id: "nearer", playerName: "Novah", rank: 3 }),
    ]);
    expect(ranked.map((row) => row.metaEventPlayerId)).toEqual(["exact"]);
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

  it("keeps the row the overlay is anchored to, however little the names share", () => {
    const ranked = rankPlayerMatches(
      { playerName: "Nova", rank: 1 },
      [player({ id: "wrong", playerName: "Ekko" }), player({ id: "right", playerName: "Nova" })],
      "wrong",
    );
    expect(ranked.map((row) => row.metaEventPlayerId)).toEqual(["wrong", "right"]);
    expect(ranked.map((row) => row.isCurrent)).toEqual([true, false]);
  });

  it("offers the row at the same finish when no player name overlaps", () => {
    const ranked = rankPlayerMatches({ playerName: "Nova", rank: 1 }, [
      player({ id: "same-finish", playerName: "Ekko", rank: 1 }),
    ]);
    expect(ranked.map((row) => row.metaEventPlayerId)).toEqual(["same-finish"]);
    expect(ranked[0]).toMatchObject({ isExact: false, reasons: ["same finish"] });
  });

  it("offers nothing when a row shares neither the name nor the finish", () => {
    expect(
      rankPlayerMatches({ playerName: "Nova", rank: 1 }, [player({ playerName: "Ekko", rank: 7 })]),
    ).toEqual([]);
  });

  it("returns nothing for an event with no standings yet", () => {
    expect(rankPlayerMatches({ playerName: "Nova", rank: 1 }, [])).toEqual([]);
  });
});

describe("summarizePlayerMatch", () => {
  const linked = { id: "row-1", playerName: "Nova", rank: 3, rankIsTier: true };

  it("names the anchored row, counting the other candidates beside it", () => {
    const suggestions = rankPlayerMatches(
      { playerName: "Nova", rank: 3 },
      [
        player({ id: "row-1", rank: 3, rankIsTier: true }),
        player({ id: "row-2", playerName: "Novaa" }),
      ],
      "row-1",
    );
    expect(summarizePlayerMatch(suggestions, linked)).toEqual({
      state: "linked",
      metaEventPlayerId: "row-1",
      playerName: "Nova",
      rank: 3,
      rankIsTier: true,
      candidateCount: 1,
    });
  });

  it("reads one same-name candidate as exact, the row Accept can link", () => {
    const suggestions = rankPlayerMatches({ playerName: "Nova", rank: 1 }, [
      player({ id: "exact", rank: 2 }),
      player({ id: "near", playerName: "Novaa" }),
    ]);
    expect(summarizePlayerMatch(suggestions, null)).toEqual({
      state: "exact",
      metaEventPlayerId: "exact",
      playerName: "Nova",
      rank: 2,
      rankIsTier: false,
      candidateCount: 2,
    });
  });

  it("leaves two same-name rows to the admin, since either could be the one", () => {
    const suggestions = rankPlayerMatches({ playerName: "Nova", rank: 1 }, [
      player({ id: "a" }),
      player({ id: "b", rank: 9 }),
    ]);
    expect(summarizePlayerMatch(suggestions, null)).toMatchObject({
      state: "candidates",
      metaEventPlayerId: null,
      candidateCount: 2,
    });
  });

  it("offers similar names as candidates, never as a match", () => {
    const suggestions = rankPlayerMatches({ playerName: "Nova", rank: 1 }, [
      player({ playerName: "Novaa" }),
    ]);
    expect(summarizePlayerMatch(suggestions, null)).toMatchObject({
      state: "candidates",
      candidateCount: 1,
    });
  });

  it("says so when nothing in the standings reads as the player", () => {
    expect(summarizePlayerMatch([], null)).toEqual({
      state: "none",
      metaEventPlayerId: null,
      playerName: null,
      rank: null,
      rankIsTier: null,
      candidateCount: 0,
    });
  });
});

describe("suggestMetaEventMatches", () => {
  const CANDIDATE_ID = "3f7a1c2e-0000-7000-8000-0000000000ca";

  function repos(candidate: Record<string, unknown> | undefined, rows: MetaEventWithCounts[] = []) {
    const listEvents = vi.fn().mockResolvedValue({ rows, total: rows.length });
    const eventById = vi.fn().mockResolvedValue(candidate);
    return {
      repos: {
        meta: { listEvents },
        metaOverlays: { eventOverlayById: eventById },
      } as unknown as Repos,
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

  it("ranks a linked candidate too, minus the event it is on, which is what a move picks from", async () => {
    const { repos: r } = repos({ ...candidate, metaEventId: "live-1" }, [
      event({ id: "live-1", name: "Summoner Skirmish Berlin" }),
      event({ id: "live-2", name: "Summoner Skirmish Berlin" }),
    ]);

    const suggestions = await suggestMetaEventMatches(r, CANDIDATE_ID);

    expect(suggestions.map((row) => row.metaEventId)).toEqual(["live-2"]);
  });

  it("suggests nothing for a candidate id that resolves to no row", async () => {
    const { repos: r, listEvents } = repos(undefined);

    expect(await suggestMetaEventMatches(r, CANDIDATE_ID)).toEqual([]);
    expect(listEvents).not.toHaveBeenCalled();
  });
});

describe("suggestMetaPlayerMatches", () => {
  const OVERLAY_ID = "3f7a1c2e-0000-7000-8000-0000000000c1";
  const LINKED_ID = "3f7a1c2e-0000-7000-8000-00000000000p";

  function playerRepos(overlay: Record<string, unknown>, players: AdminMetaPlayerRow[]): Repos {
    return {
      meta: {
        eventIdForPlayer: vi.fn().mockResolvedValue("live-1"),
        adminPlayersForEvent: vi.fn().mockResolvedValue(players),
      },
      metaOverlays: {
        playerOverlayById: vi.fn().mockResolvedValue(overlay),
        eventOverlayById: vi.fn().mockResolvedValue(undefined),
      },
    } as unknown as Repos;
  }

  it("matches on the linked row once the link pruned the overlay's own name and finish", async () => {
    const repos = playerRepos(
      {
        id: OVERLAY_ID,
        metaEventId: null,
        metaEventPlayerId: LINKED_ID,
        eventOverlayId: null,
        playerName: null,
        rank: null,
      },
      [player({ id: LINKED_ID }), player({ id: "other", playerName: "Ekko", rank: 2 })],
    );

    const suggestions = await suggestMetaPlayerMatches(repos, OVERLAY_ID);

    expect(suggestions.map((row) => row.metaEventPlayerId)).toEqual([LINKED_ID]);
    expect(suggestions[0].isCurrent).toBe(true);
  });

  it("suggests nothing for an unlinked overlay that names no player of its own", async () => {
    const repos = playerRepos(
      {
        id: OVERLAY_ID,
        metaEventId: "live-1",
        metaEventPlayerId: null,
        eventOverlayId: null,
        playerName: null,
        rank: null,
      },
      [player()],
    );

    expect(await suggestMetaPlayerMatches(repos, OVERLAY_ID)).toEqual([]);
  });
});

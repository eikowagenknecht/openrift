import { createLogger } from "@openrift/shared/logger";
import { describe, expect, it, vi } from "vitest";

import type { Repos, Transact } from "../../deps.js";
import type { UvsgamesListRow } from "../../repositories/uvsgames-events.js";
import { deepFetchEvent } from "./deep-fetch.js";
import type { MetaSyncDeps } from "./deps.js";
import type { UvsClient, UvsQuery } from "./uvsgames-client.js";
import { UvsHttpError } from "./uvsgames-client.js";

vi.mock("../meta-promote.js", () => ({
  promoteMetaEvent: vi.fn(() =>
    Promise.resolve({
      metaEventId: "live-1",
      players: 1,
      decks: 0,
      matches: 1,
      phases: 2,
      unresolvedNames: [],
      errors: [],
    }),
  ),
}));

const NOW = new Date("2026-08-20T12:00:00Z");

function catalogRow(overrides: Partial<UvsgamesListRow> = {}): UvsgamesListRow {
  return {
    externalId: "365708",
    name: "Riftbound Regional Qualifier - Bologna",
    startAt: new Date("2026-02-20T09:00:00Z"),
    endAtEstimate: null,
    displayStatus: "complete",
    decklistStatus: null,
    playerCount: 1719,
    eventType: "LOCALS",
    eventFormat: "Constructed",
    storeId: 19_428,
    storeName: "UVS Games Organized Play",
    storeDisplayName: "UVS Games Organized Play",
    location: null,
    timezone: "Europe/Rome",
    eventConfigurationTemplate: "0cbcab3e-be80-4d1d-a450-9485e584906d",
    contentHash: "hash",
    resultsFetchedAt: null,
    firstSeenAt: NOW,
    lastSeenAt: NOW,
    missingSince: null,
    nextCheckAt: null,
    checkStage: 0,
    triage: "accepted",
    metaEventId: "live-1",
    metaEventSlug: "rq-bologna",
    ...overrides,
  };
}

interface PageCall {
  path: string;
  page: number;
  pageSize: number;
}

/** An accepted event: its key is linked to a live row, so promotion runs. */
function acceptedSource(): { metaEventId: string } {
  return { metaEventId: "live-1" };
}

function fakeDeps(
  options: {
    registrations?: unknown[];
    /** Registrations spread over several pages, for the truncation cases. */
    registrationPages?: unknown[][];
    /** Pages the source refuses, keyed `<path fragment>:<page>`. */
    failedPages?: string[];
    deck?: (deckId: string) => unknown;
    detail?: unknown;
    /** Makes the event-detail read fail, the way a source blip does. */
    detailFails?: boolean;
    heldRounds?: string[];
    roundMatches?: (roundId: string) => unknown[];
    roundStandings?: (roundId: string) => unknown[];
    /** Standings this event's mirror already holds. */
    standingsHeld?: Record<string, unknown>[];
    /** Deck ids the mirror still owes, which is what the fetch asks for. */
    outstandingDecks?: string[];
    /** The citation linking this key to a live event; absent means unaccepted. */
    source?: { metaEventId: string };
  } = {},
): {
  deps: MetaSyncDeps;
  pageCalls: PageCall[];
  deckRequests: string[];
  stagedRounds: { roundId: string; rows: Record<string, unknown>[] }[];
  mirroredStandings: Record<string, unknown>[];
  mirroredPhases: Record<string, unknown>[];
  storedDecklists: { row: Record<string, unknown>; cards: Record<string, unknown>[] }[];
  liveMatches: Record<string, unknown>[];
  livePhases: Record<string, unknown>[];
  fetchMarks: { externalId: string; at: Date }[];
  /** Mirror writes and reads in the order the pass made them. */
  callOrder: string[];
} {
  const pageCalls: PageCall[] = [];
  const deckRequests: string[] = [];
  const stagedRounds: { roundId: string; rows: Record<string, unknown>[] }[] = [];
  const mirroredStandings: Record<string, unknown>[] = [];
  const mirroredPhases: Record<string, unknown>[] = [];
  const storedDecklists: { row: Record<string, unknown>; cards: Record<string, unknown>[] }[] = [];
  const liveMatches: Record<string, unknown>[] = [];
  const livePhases: Record<string, unknown>[] = [];
  const fetchMarks: { externalId: string; at: Date }[] = [];
  const callOrder: string[] = [];

  /** Which of the paginated endpoints a path is, and what this fake answers with. */
  function pageResults(path: string, page: number): unknown[] {
    const matchRound = /\/tournament-rounds\/(?<roundId>[^/]+)\/matches\//u.exec(path)?.groups
      ?.roundId;
    if (matchRound !== undefined) {
      return options.roundMatches?.(matchRound) ?? [];
    }
    const standingsRound = /\/tournament-rounds\/(?<roundId>[^/]+)\/standings\//u.exec(path)?.groups
      ?.roundId;
    if (standingsRound !== undefined) {
      return options.roundStandings?.(standingsRound) ?? [];
    }
    if (path.includes("/registrations/")) {
      const pages = options.registrationPages;
      return pages?.[page - 1] ?? (page === 1 ? (options.registrations ?? []) : []);
    }
    return [];
  }

  const client: UvsClient = {
    get: <T>(path: string) => {
      const deckId = /\/deckbuilder\/decks\/(?<deckId>[^/]+)\//u.exec(path)?.groups?.deckId;
      if (deckId === undefined) {
        if (/\/api\/v2\/events\/[^/]+\/$/u.test(path)) {
          return options.detailFails === true
            ? Promise.reject(new Error("HTTP 503 for the detail"))
            : Promise.resolve((options.detail ?? {}) as T);
        }
        return Promise.resolve({} as T);
      }
      deckRequests.push(deckId);
      try {
        return Promise.resolve((options.deck?.(deckId) ?? {}) as T);
      } catch (error) {
        return Promise.reject(error as Error);
      }
    },
    page: <T>(path: string, _query: UvsQuery, page: number, pageSize = 250) => {
      pageCalls.push({ path, page, pageSize });
      const refused = (options.failedPages ?? []).some(
        (entry) => path.includes(entry.split(":")[0] ?? "") && Number(entry.split(":")[1]) === page,
      );
      if (refused) {
        return Promise.reject(new Error("HTTP 503"));
      }
      const registrationPages = options.registrationPages;
      const isRegistrations = path.includes("/registrations/");
      const results = pageResults(path, page);
      const morePages =
        (path.includes("/tv/standings/") && page === 1) ||
        (isRegistrations && registrationPages !== undefined && page < registrationPages.length);
      return Promise.resolve({
        results: results as T[],
        count: results.length,
        nextPage: morePages ? page + 1 : null,
      });
    },
    requests: 0,
  };

  const deps: MetaSyncDeps = {
    repos: {
      uvsgamesResults: {
        standings: () => Promise.resolve(options.standingsHeld ?? []),
        replaceStandings: (_externalId: string, rows: Record<string, unknown>[]) => {
          callOrder.push("replaceStandings");
          mirroredStandings.push(...rows);
          return Promise.resolve();
        },
        replacePhases: (_externalId: string, rows: Record<string, unknown>[]) => {
          mirroredPhases.push(...rows);
          return Promise.resolve();
        },
        heldRoundIds: () => Promise.resolve(options.heldRounds ?? []),
        replaceRoundMatches: (
          _externalId: string,
          roundId: string,
          rows: Record<string, unknown>[],
        ) => {
          stagedRounds.push({ roundId, rows });
          return Promise.resolve();
        },
        deckCoverage: () => {
          callOrder.push("deckCoverage");
          return Promise.resolve({ outstanding: options.outstandingDecks ?? [], held: 0 });
        },
        putDecklist: (row: Record<string, unknown>, cards: Record<string, unknown>[]) => {
          storedDecklists.push({ row, cards });
          return Promise.resolve();
        },
      },
      meta: {
        sourceByKey: () => Promise.resolve(options.source),
        upsertEventMatches: (rows: Record<string, unknown>[]) => {
          liveMatches.push(...rows);
          return Promise.resolve(rows.map((_row, index) => ({ id: `live-match-${index + 1}` })));
        },
        replaceEventPhases: (_eventId: string, rows: Record<string, unknown>[]) => {
          livePhases.push(...rows);
          return Promise.resolve();
        },
      },
      uvsgamesEvents: {
        formatMappings: () => Promise.resolve(new Map([["constructed", "constructed"]])),
        templateTiers: () => Promise.resolve(new Map()),
        upsertPlayers: () => Promise.resolve(0),
        markResultsFetched: (externalId: string, at: Date) => {
          fetchMarks.push({ externalId, at });
          return Promise.resolve();
        },
      },
    } as unknown as Repos,
    transact: (() => Promise.reject(new Error("mocked out"))) as unknown as Transact,
    client,
    log: createLogger("test"),
    now: () => NOW,
  };
  return {
    deps,
    pageCalls,
    deckRequests,
    stagedRounds,
    mirroredStandings,
    mirroredPhases,
    storedDecklists,
    liveMatches,
    livePhases,
    fetchMarks,
    callOrder,
  };
}

describe("deepFetchEvent", () => {
  it("pages the final standings at the tv page size until the envelope ends", async () => {
    const { deps, pageCalls } = fakeDeps();

    await deepFetchEvent(deps, catalogRow());

    const standings = pageCalls.filter((call) => call.path.includes("/tv/standings/"));
    expect(standings).toEqual([
      { path: "/api/v2/player/events/365708/tv/standings/", page: 1, pageSize: 500 },
      { path: "/api/v2/player/events/365708/tv/standings/", page: 2, pageSize: 500 },
    ]);
  });

  it("counts the card names promotion could not match, without failing the pass", async () => {
    const { deps } = fakeDeps({ source: acceptedSource() });

    const result = await deepFetchEvent(deps, catalogRow());

    // The standings are live either way; only the decks behind unmatched names
    // are withheld, which is the pyramid working as intended.
    expect(result.skippedPlayers).toBe(0);
  });

  it("asks only for the decks the mirror still owes", async () => {
    const { deps, deckRequests } = fakeDeps({
      source: acceptedSource(),
      outstandingDecks: ["d-open"],
      registrations: [
        { id: "r1", deck_id: "d-held" },
        { id: "r2", deck_id: "d-open" },
      ],
    });

    await deepFetchEvent(deps, catalogRow({ decklistStatus: "PUBLISHED" }));

    expect(deckRequests).toEqual(["d-open"]);
  });

  it("marks the results fetched even when the event's field came back empty", async () => {
    const { deps, fetchMarks, mirroredStandings } = fakeDeps({ source: acceptedSource() });

    await deepFetchEvent(deps, catalogRow());

    // A cancelled event legitimately mirrors no standings. Counting rows would
    // leave the ladder revisiting it until the ladder ran out.
    expect(mirroredStandings).toEqual([]);
    expect(fetchMarks).toEqual([{ externalId: "365708", at: NOW }]);
  });

  it("marks nothing fetched on a pass that wrote nothing", async () => {
    const { deps, fetchMarks } = fakeDeps({
      source: acceptedSource(),
      failedPages: ["/tv/standings/:1"],
    });

    await deepFetchEvent(deps, catalogRow());

    expect(fetchMarks).toEqual([]);
  });

  it("reads the outstanding decks after mirroring the standings", async () => {
    const { deps, callOrder } = fakeDeps({
      source: acceptedSource(),
      registrations: [{ id: "r1", best_identifier: "Ashwalker", final_place_in_standings: 1 }],
    });

    await deepFetchEvent(deps, catalogRow({ decklistStatus: "PUBLISHED" }));

    // The gap is computed from deck ids this pass just wrote, so a first visit
    // asks for decks instead of finding an empty mirror and fetching none.
    expect(callOrder).toEqual(["replaceStandings", "deckCoverage"]);
  });

  it("records a refused deck so it is not retried, but leaves a transient failure open", async () => {
    const { deps, storedDecklists } = fakeDeps({
      source: acceptedSource(),
      outstandingDecks: ["d-gone", "d-flaky"],
      registrations: [
        { id: "r1", deck_id: "d-gone" },
        { id: "r2", deck_id: "d-flaky" },
      ],
      deck: (deckId) => {
        throw deckId === "d-gone"
          ? new UvsHttpError(404, "/decks/d-gone/", "not found")
          : new UvsHttpError(503, "/decks/d-flaky/", "busy");
      },
    });

    await deepFetchEvent(deps, catalogRow({ decklistStatus: "PUBLISHED" }));

    // A 4xx is the source refusing for good, so the id is recorded and never
    // asked for again. A 503 records nothing, leaving it fetchable next pass.
    expect(storedDecklists.map((entry) => entry.row)).toEqual([
      expect.objectContaining({ sourceDeckId: "d-gone", fetchStatus: "refused" }),
    ]);
  });

  const TWO_ROUND_DETAIL = {
    tournament_phases: [
      {
        rounds: [
          { id: 901, status: "complete", round_number: 1 },
          { id: 902, status: "complete", round_number: 2 },
        ],
      },
    ],
  };

  function matchRow(userA: number, userB: number) {
    return {
      id: `m-${userA}-${userB}`,
      table_number: 1,
      winning_player: userA,
      games_won_by_winner: 2,
      games_won_by_loser: 0,
      player_match_relationships: [
        { user_event_status: { user: { id: userA, best_identifier: `P ${userA}` } } },
        { user_event_status: { user: { id: userB, best_identifier: `P ${userB}` } } },
      ],
    };
  }

  it("mirrors matches only for rounds it does not already hold", async () => {
    const { deps, pageCalls, stagedRounds } = fakeDeps({
      source: acceptedSource(),
      detail: TWO_ROUND_DETAIL,
      heldRounds: ["901"],
      roundMatches: () => [matchRow(11, 12)],
    });

    const result = await deepFetchEvent(deps, catalogRow());

    const matchCalls = pageCalls.filter((call) => call.path.includes("/matches/paginated/"));
    expect(matchCalls).toEqual([
      { path: "/api/v2/tournament-rounds/902/matches/paginated/", page: 1, pageSize: 250 },
    ]);
    expect(stagedRounds).toHaveLength(1);
    expect(stagedRounds[0]?.roundId).toBe("902");
    expect(stagedRounds[0]?.rows[0]).toMatchObject({
      roundNumber: 2,
      player1UvsgamesId: 11,
      player2UvsgamesId: 12,
      winnerUvsgamesId: 11,
    });
    expect(result.stagedMatches).toBe(1);
    // Matches never land in the stored raw payload.
  });

  it("leaves a round unstaged when one of its match pages fails", async () => {
    const { deps, stagedRounds } = fakeDeps({
      source: acceptedSource(),
      detail: TWO_ROUND_DETAIL,
      roundMatches: (roundId) => {
        if (roundId === "901") {
          throw new Error("HTTP 503");
        }
        return [matchRow(21, 22)];
      },
    });

    const result = await deepFetchEvent(deps, catalogRow());

    expect(stagedRounds.map((round) => round.roundId)).toEqual(["902"]);
    expect(result.stagedMatches).toBe(1);
    expect(result.errors.some((line) => line.includes("Round 1 matches"))).toBe(true);
  });

  it("names the event in every error, so a merged run can tell whose round failed", async () => {
    const { deps } = fakeDeps({
      source: acceptedSource(),
      detail: TWO_ROUND_DETAIL,
      roundMatches: (roundId) => {
        if (roundId === "901") {
          throw new Error("HTTP 503");
        }
        return [matchRow(21, 22)];
      },
    });

    const result = await deepFetchEvent(deps, catalogRow());

    expect(result.errors).toEqual([
      'Event "Riftbound Regional Qualifier - Bologna" (365708): Round 1 matches page 1: HTTP 503',
    ]);
  });

  it("stages nothing when a registrations page fails, rather than a short player list", async () => {
    const { deps, mirroredStandings } = fakeDeps({
      source: acceptedSource(),
      registrationPages: [
        [{ id: "r1", best_identifier: "Ashwalker", final_place_in_standings: 1 }],
        [{ id: "r2", best_identifier: "Riven", final_place_in_standings: 2 }],
      ],
      failedPages: ["/registrations/:2"],
    });

    const result = await deepFetchEvent(deps, catalogRow());

    // The mirror replaces an event's standings wholesale, so a short list
    // would delete the players it did not carry.
    expect(mirroredStandings).toEqual([]);
    expect(result.players).toBe(0);
    expect(result.errors.at(-1)).toContain("came back incomplete");
  });

  /** A premier event: two swiss rounds, then a top cut only the leaders enter. */
  const TOP_CUT_DETAIL = {
    tournament_phases: [
      {
        round_type: "SWISS",
        rounds: [
          { id: 901, status: "complete", round_number: 1 },
          { id: 902, status: "complete", round_number: 2 },
        ],
      },
      {
        round_type: "RANKED_SINGLE_ELIMINATION",
        rank_required_to_enter_phase: 8,
        rounds: [{ id: 903, status: "complete", round_number: 1 }],
      },
    ],
  };

  const TOP_CUT_REGISTRATIONS = [
    { id: "reg-cut", best_identifier: "Cut Player", final_place_in_standings: 1 },
    { id: "reg-swiss", best_identifier: "Swiss Player", final_place_in_standings: 20 },
  ];

  function standingRow(registrationId: string, legend: string, matchPoints: number) {
    return {
      match_points: matchPoints,
      user_event_status: { id: registrationId, deck_defining_card: { name: legend } },
    };
  }

  /** The round ids whose standings the pass asked for, in request order. */
  function standingsRoundsRead(calls: PageCall[]): string[] {
    return calls
      .map(
        (call) =>
          /\/tournament-rounds\/(?<roundId>[^/]+)\/standings\//u.exec(call.path)?.groups?.roundId,
      )
      .filter((roundId) => roundId !== undefined);
  }

  it("keeps every swiss player's legend when a top cut is the last completed round", async () => {
    const { deps, mirroredStandings } = fakeDeps({
      source: acceptedSource(),
      detail: TOP_CUT_DETAIL,
      registrations: TOP_CUT_REGISTRATIONS,
      roundStandings: (roundId) =>
        roundId === "903"
          ? [standingRow("reg-cut", "Cut Legend", 12)]
          : [
              standingRow("reg-cut", "Swiss Legend For Cut", 9),
              standingRow("reg-swiss", "Swiss Legend", 6),
            ],
    });

    await deepFetchEvent(deps, catalogRow());

    expect(mirroredStandings).toMatchObject([
      { registrationId: "reg-cut", legendName: "Cut Legend", matchPoints: 12 },
      { registrationId: "reg-swiss", legendName: "Swiss Legend", matchPoints: 6 },
    ]);
  });

  it("reads back only as far as the last phase nobody was cut from", async () => {
    const { deps, pageCalls } = fakeDeps({
      source: acceptedSource(),
      detail: TOP_CUT_DETAIL,
      registrations: TOP_CUT_REGISTRATIONS,
      roundStandings: () => [],
    });

    await deepFetchEvent(deps, catalogRow());

    expect(standingsRoundsRead(pageCalls)).toEqual(["903", "902"]);
  });

  it("reads one round's standings for an event that never cut anyone", async () => {
    const { deps, pageCalls } = fakeDeps({
      source: acceptedSource(),
      detail: TWO_ROUND_DETAIL,
      registrations: TOP_CUT_REGISTRATIONS,
      roundStandings: () => [],
    });

    await deepFetchEvent(deps, catalogRow());

    expect(standingsRoundsRead(pageCalls)).toEqual(["902"]);
  });

  it("writes nothing when the event detail fails, rather than emptying the mirror", async () => {
    const { deps, mirroredStandings } = fakeDeps({
      source: acceptedSource(),
      registrations: [{ id: "r1", best_identifier: "Ashwalker", final_place_in_standings: 1 }],
      detailFails: true,
    });

    const result = await deepFetchEvent(deps, catalogRow());

    expect(mirroredStandings).toEqual([]);
    expect(result.errors.at(-1)).toContain("came back incomplete");
  });

  it("reuses a detail the caller already fetched instead of reading it again", async () => {
    const { deps } = fakeDeps({
      source: acceptedSource(),
      detailFails: true,
    });

    const result = await deepFetchEvent(deps, catalogRow(), undefined, TWO_ROUND_DETAIL);

    expect(result.errors).toEqual([]);
  });

  it("writes nothing when the final standings fail", async () => {
    const { deps, mirroredStandings } = fakeDeps({
      source: acceptedSource(),
      registrations: [{ id: "r1", best_identifier: "Ashwalker", final_place_in_standings: 1 }],
      failedPages: ["/tv/standings/:1"],
    });

    const result = await deepFetchEvent(deps, catalogRow());

    expect(mirroredStandings).toEqual([]);
    expect(result.errors.at(-1)).toContain("came back incomplete");
  });

  it("spends no deck requests on an event it will not stage", async () => {
    const { deps, deckRequests } = fakeDeps({
      source: acceptedSource(),
      registrations: [{ id: "r1", best_identifier: "Ashwalker", deck_id: "d-open" }],
      failedPages: ["/registrations/:1"],
      deck: () => ({ sections: [] }),
    });

    await deepFetchEvent(deps, catalogRow({ decklistStatus: "PUBLISHED" }));

    expect(deckRequests).toEqual([]);
  });

  it("mirrors the event's phase structure", async () => {
    const { deps, mirroredPhases } = fakeDeps({
      source: acceptedSource(),
      detail: {
        tournament_phases: [
          {
            phase_name: "Phase 1",
            round_type: "SWISS",
            number_of_rounds: 8,
            effective_maximum_number_of_game_wins_per_match: 2,
            rounds: [{ id: 901, status: "complete", round_number: 1 }],
          },
          {
            phase_name: "Phase 2",
            round_type: "RANKED_SINGLE_ELIMINATION",
            number_of_rounds: 3,
            rank_required_to_enter_phase: 8,
            rounds: [],
          },
        ],
      },
      roundMatches: () => [],
    });

    await deepFetchEvent(deps, catalogRow());

    expect(mirroredPhases).toMatchObject([
      { phaseOrder: 0, roundType: "SWISS", roundCount: 8, maxGameWins: 2, rankRequired: null },
      { phaseOrder: 1, roundType: "RANKED_SINGLE_ELIMINATION", rankRequired: 8 },
    ]);
  });
});

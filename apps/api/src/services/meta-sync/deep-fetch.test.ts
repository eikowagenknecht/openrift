import { createLogger } from "@openrift/shared/logger";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Repos, Transact } from "../../deps.js";
import type {
  CandidateMetaEventRow,
  CandidateMetaMatchRow,
  CandidateMetaPlayerRow,
  NewCandidateMetaMatch,
} from "../../repositories/meta-candidates.js";
import type { UvsgamesListRow } from "../../repositories/uvsgames-events.js";
import { deepFetchEvent } from "./deep-fetch.js";
import type { MetaSyncDeps } from "./deps.js";
import type { UvsClient, UvsQuery } from "./uvsgames-client.js";
import { UvsHttpError } from "./uvsgames-client.js";

const { ingestMetaCandidates } = vi.hoisted(() => ({
  ingestMetaCandidates: vi.fn(() => Promise.resolve({ errors: [] })),
}));

vi.mock("../ingest-meta-candidates.js", () => ({ ingestMetaCandidates }));

vi.mock("../meta-candidate-accept.js", () => ({
  acceptCandidateEvent: vi.fn(() => Promise.resolve()),
  acceptCandidatePlayer: vi.fn(() => Promise.resolve()),
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
    firstSeenAt: NOW,
    lastSeenAt: NOW,
    missingSince: null,
    nextCheckAt: null,
    checkStage: 0,
    triage: "accepted",
    candidateEventId: "cand-1",
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

function stagedCandidate(): CandidateMetaEventRow {
  return {
    id: "cand-1",
    metaEventId: "live-1",
    format: "constructed",
  } as CandidateMetaEventRow;
}

function stagedPlayer(overrides: Partial<CandidateMetaPlayerRow> = {}): CandidateMetaPlayerRow {
  return {
    id: `player-${crypto.randomUUID().slice(0, 8)}`,
    candidateEventId: "cand-1",
    externalId: "reg-1",
    playerName: "Player",
    rank: 1,
    cards: null,
    ...overrides,
  } as CandidateMetaPlayerRow;
}

function fakeDeps(
  options: {
    candidate?: CandidateMetaEventRow;
    players?: CandidateMetaPlayerRow[];
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
    stagedMatches?: CandidateMetaMatchRow[];
  } = {},
): {
  deps: MetaSyncDeps;
  pageCalls: PageCall[];
  deckRequests: string[];
  updates: Record<string, unknown>[];
  setEventCheckedAt: ReturnType<typeof vi.fn>;
  stagedRounds: { roundId: string; rows: NewCandidateMetaMatch[] }[];
  liveMatches: Record<string, unknown>[];
  livePhases: Record<string, unknown>[];
  matchStamps: Map<string, string>;
} {
  const pageCalls: PageCall[] = [];
  const deckRequests: string[] = [];
  const updates: Record<string, unknown>[] = [];
  const setEventCheckedAt = vi.fn(() => Promise.resolve(true));
  const stagedRounds: { roundId: string; rows: NewCandidateMetaMatch[] }[] = [];
  const liveMatches: Record<string, unknown>[] = [];
  const livePhases: Record<string, unknown>[] = [];
  const matchStamps = new Map<string, string>();

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
      metaCandidates: {
        eventById: () => Promise.resolve(options.candidate),
        eventsBySourceKeys: () =>
          Promise.resolve(options.candidate === undefined ? [] : [options.candidate]),
        eventsByMetaEventId: () =>
          Promise.resolve(options.candidate === undefined ? [] : [options.candidate]),
        playersByCandidateEventIds: () => Promise.resolve(options.players ?? []),
        updateEvent: (_id: string, values: Record<string, unknown>) => {
          updates.push(values);
          return Promise.resolve();
        },
        setPlayerUvsIds: () => Promise.resolve(),
        setEventCheckedAt,
        matchRoundIds: () => Promise.resolve(options.heldRounds ?? []),
        replaceRoundMatches: (
          _candidateEventId: string,
          roundId: string,
          rows: NewCandidateMetaMatch[],
        ) => {
          stagedRounds.push({ roundId, rows });
          return Promise.resolve();
        },
        unmaterializedMatches: () => Promise.resolve(options.stagedMatches ?? []),
        setMatchLiveIds: (stamps: ReadonlyMap<string, string>) => {
          for (const [id, liveId] of stamps) {
            matchStamps.set(id, liveId);
          }
          return Promise.resolve();
        },
      },
      meta: {
        upsertEventMatches: (rows: Record<string, unknown>[]) => {
          liveMatches.push(...rows);
          return Promise.resolve(
            rows.map((row, index) => ({
              id: `live-match-${index + 1}`,
              sourceMatchId: row.sourceMatchId,
            })),
          );
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
    updates,
    setEventCheckedAt,
    stagedRounds,
    liveMatches,
    livePhases,
    matchStamps,
  };
}

describe("deepFetchEvent", () => {
  beforeEach(() => {
    ingestMetaCandidates.mockClear();
  });

  it("pages the final standings at the tv page size until the envelope ends", async () => {
    const { deps, pageCalls } = fakeDeps();

    await deepFetchEvent(deps, catalogRow());

    const standings = pageCalls.filter((call) => call.path.includes("/tv/standings/"));
    expect(standings).toEqual([
      { path: "/api/v2/player/events/365708/tv/standings/", page: 1, pageSize: 500 },
      { path: "/api/v2/player/events/365708/tv/standings/", page: 2, pageSize: 500 },
    ]);
  });

  it("sends the event back to review when the auto-accept leaves players behind", async () => {
    const { deps, setEventCheckedAt } = fakeDeps({
      candidate: stagedCandidate(),
      players: [
        stagedPlayer(),
        stagedPlayer({
          externalId: "reg-2",
          playerName: "Unresolved Player",
          cards: [{ name: "Mystery Card", zone: "main", quantity: 3, cardId: null }],
        }),
      ],
    });

    const result = await deepFetchEvent(deps, catalogRow());

    expect(result.skippedPlayers).toBe(1);
    expect(setEventCheckedAt).toHaveBeenCalledWith("cand-1", null);
  });

  it("leaves the review state settled when every player accepts", async () => {
    const { deps, setEventCheckedAt } = fakeDeps({
      candidate: stagedCandidate(),
      players: [stagedPlayer()],
    });

    const result = await deepFetchEvent(deps, catalogRow());

    expect(result.acceptedPlayers).toBe(1);
    expect(result.skippedPlayers).toBe(0);
    expect(setEventCheckedAt).not.toHaveBeenCalled();
  });

  it("fetches only the decks the stored raw does not already hold", async () => {
    const registrations = [
      { id: "r1", deck_id: "d-held" },
      { id: "r2", deck_id: "d-open" },
    ];
    const candidate = {
      ...stagedCandidate(),
      raw: { registrations, decks: { "d-held": { sections: [] } } },
    } as CandidateMetaEventRow;
    const { deps, deckRequests, updates } = fakeDeps({
      candidate,
      players: [],
      registrations,
      deck: () => ({ sections: [] }),
    });

    await deepFetchEvent(deps, catalogRow({ decklistStatus: "PUBLISHED" }));

    expect(deckRequests).toEqual(["d-open"]);
    expect(updates.at(-1)?.raw).toMatchObject({
      decks: { "d-held": { sections: [] }, "d-open": { sections: [] } },
    });
  });

  it("records a refused deck so it is not retried, but leaves a transient failure open", async () => {
    const registrations = [
      { id: "r1", deck_id: "d-gone" },
      { id: "r2", deck_id: "d-flaky" },
    ];
    const { deps, updates } = fakeDeps({
      candidate: stagedCandidate(),
      players: [],
      registrations,
      deck: (deckId) => {
        throw deckId === "d-gone"
          ? new UvsHttpError(404, "/decks/d-gone/", "not found")
          : new UvsHttpError(503, "/decks/d-flaky/", "busy");
      },
    });

    const result = await deepFetchEvent(deps, catalogRow({ decklistStatus: "PUBLISHED" }));

    const stored = updates.at(-1)?.raw as { decks: Record<string, unknown> };
    expect(stored.decks).toMatchObject({ "d-gone": null });
    expect(stored.decks).not.toHaveProperty("d-flaky");
    expect(result.decks).toBe(0);
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

  it("stages matches only for rounds the candidate does not already hold", async () => {
    const { deps, pageCalls, stagedRounds, updates } = fakeDeps({
      candidate: stagedCandidate(),
      players: [],
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
      candidateEventId: "cand-1",
      roundNumber: 2,
      player1UvsgamesId: 11,
      player2UvsgamesId: 12,
      winnerUvsgamesId: 11,
    });
    expect(result.stagedMatches).toBe(1);
    // Matches never land in the stored raw payload.
    expect(updates.at(-1)?.raw).not.toHaveProperty("matches");
  });

  it("leaves a round unstaged when one of its match pages fails", async () => {
    const { deps, stagedRounds } = fakeDeps({
      candidate: stagedCandidate(),
      players: [],
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

  it("stages nothing when a registrations page fails, rather than a short player list", async () => {
    const { deps, updates } = fakeDeps({
      candidate: stagedCandidate(),
      players: [],
      registrationPages: [
        [{ id: "r1", best_identifier: "Ashwalker", final_place_in_standings: 1 }],
        [{ id: "r2", best_identifier: "Riven", final_place_in_standings: 2 }],
      ],
      failedPages: ["/registrations/:2"],
    });

    const result = await deepFetchEvent(deps, catalogRow());

    // The ingest replaces the staged roster wholesale, so a short list deletes
    // players and the live rows keyed to them.
    expect(ingestMetaCandidates).not.toHaveBeenCalled();
    expect(updates).toEqual([]);
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

  /** The field as the ingest was handed it. */
  function stagedPlayers(): Record<string, unknown>[] {
    const call = ingestMetaCandidates.mock.calls[0] as unknown[] | undefined;
    const events = call?.[2] as { players: Record<string, unknown>[] }[] | undefined;
    return events?.[0]?.players ?? [];
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
    const { deps } = fakeDeps({
      candidate: stagedCandidate(),
      players: [],
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

    expect(stagedPlayers()).toMatchObject([
      { externalId: "reg-cut", legendName: "Cut Legend", matchPoints: 12 },
      { externalId: "reg-swiss", legendName: "Swiss Legend", matchPoints: 6 },
    ]);
  });

  it("reads back only as far as the last phase nobody was cut from", async () => {
    const { deps, pageCalls } = fakeDeps({
      candidate: stagedCandidate(),
      players: [],
      detail: TOP_CUT_DETAIL,
      registrations: TOP_CUT_REGISTRATIONS,
      roundStandings: () => [],
    });

    await deepFetchEvent(deps, catalogRow());

    expect(standingsRoundsRead(pageCalls)).toEqual(["903", "902"]);
  });

  it("reads one round's standings for an event that never cut anyone", async () => {
    const { deps, pageCalls } = fakeDeps({
      candidate: stagedCandidate(),
      players: [],
      detail: TWO_ROUND_DETAIL,
      registrations: TOP_CUT_REGISTRATIONS,
      roundStandings: () => [],
    });

    await deepFetchEvent(deps, catalogRow());

    expect(standingsRoundsRead(pageCalls)).toEqual(["902"]);
  });

  it("stages nothing when the event detail fails, rather than blanking the stored raw", async () => {
    const { deps, updates } = fakeDeps({
      candidate: stagedCandidate(),
      players: [],
      registrations: [{ id: "r1", best_identifier: "Ashwalker", final_place_in_standings: 1 }],
      detailFails: true,
    });

    const result = await deepFetchEvent(deps, catalogRow());

    expect(ingestMetaCandidates).not.toHaveBeenCalled();
    expect(updates).toEqual([]);
    expect(result.errors.at(-1)).toContain("came back incomplete");
  });

  it("reuses a detail the caller already fetched instead of reading it again", async () => {
    const { deps } = fakeDeps({
      candidate: stagedCandidate(),
      players: [],
      detailFails: true,
    });

    const result = await deepFetchEvent(deps, catalogRow(), undefined, TWO_ROUND_DETAIL);

    expect(result.errors).toEqual([]);
  });

  it("stages nothing when the final standings fail", async () => {
    const { deps } = fakeDeps({
      candidate: stagedCandidate(),
      players: [],
      registrations: [{ id: "r1", best_identifier: "Ashwalker", final_place_in_standings: 1 }],
      failedPages: ["/tv/standings/:1"],
    });

    const result = await deepFetchEvent(deps, catalogRow());

    expect(ingestMetaCandidates).not.toHaveBeenCalled();
    expect(result.errors.at(-1)).toContain("came back incomplete");
  });

  it("spends no deck requests on an event it will not stage", async () => {
    const { deps, deckRequests } = fakeDeps({
      candidate: stagedCandidate(),
      players: [],
      registrations: [{ id: "r1", best_identifier: "Ashwalker", deck_id: "d-open" }],
      failedPages: ["/registrations/:1"],
      deck: () => ({ sections: [] }),
    });

    await deepFetchEvent(deps, catalogRow({ decklistStatus: "PUBLISHED" }));

    expect(deckRequests).toEqual([]);
  });

  it("copies the event's phase structure onto the live event", async () => {
    const { deps, livePhases } = fakeDeps({
      candidate: stagedCandidate(),
      players: [],
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

    const result = await deepFetchEvent(deps, catalogRow());

    expect(result.phases).toBe(2);
    expect(livePhases).toMatchObject([
      { phaseOrder: 0, roundType: "SWISS", roundCount: 8, maxGameWins: 2, rankRequired: null },
      { phaseOrder: 1, roundType: "RANKED_SINGLE_ELIMINATION", rankRequired: 8 },
    ]);
  });

  it("materializes staged matches whose participants are all live, and leaves the rest waiting", async () => {
    const stagedMatch = (id: string, p1: number, p2: number) =>
      ({
        id,
        candidateEventId: "cand-1",
        roundId: "901",
        phaseOrder: 0,
        roundNumber: 1,
        tableNumber: 1,
        isBye: false,
        isDraw: false,
        player1UvsgamesId: p1,
        player2UvsgamesId: p2,
        winnerUvsgamesId: p1,
        gamesWonP1: 2,
        gamesWonP2: 0,
        sourceMatchId: `src-${id}`,
        metaEventMatchId: null,
      }) as unknown as CandidateMetaMatchRow;

    const { deps, liveMatches, matchStamps } = fakeDeps({
      candidate: stagedCandidate(),
      players: [
        stagedPlayer({ uvsgamesPlayerId: 11, metaEventPlayerId: "live-p-11" }),
        stagedPlayer({ externalId: "reg-2", uvsgamesPlayerId: 12, metaEventPlayerId: "live-p-12" }),
        stagedPlayer({ externalId: "reg-3", uvsgamesPlayerId: 13, metaEventPlayerId: null }),
      ],
      stagedMatches: [stagedMatch("m-1", 11, 12), stagedMatch("m-2", 11, 13)],
    });

    const result = await deepFetchEvent(deps, catalogRow());

    expect(liveMatches).toHaveLength(1);
    expect(liveMatches[0]).toMatchObject({
      metaEventId: "live-1",
      player1Id: "live-p-11",
      player2Id: "live-p-12",
      winnerId: "live-p-11",
    });
    expect(matchStamps.get("m-1")).toBe("live-match-1");
    expect(matchStamps.has("m-2")).toBe(false);
    expect(result.liveMatches).toBe(1);
  });
});
